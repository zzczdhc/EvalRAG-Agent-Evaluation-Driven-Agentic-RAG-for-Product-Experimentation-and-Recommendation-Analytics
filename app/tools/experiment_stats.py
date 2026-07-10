"""Pure-Python statistical tools for synthetic A/B experiment CSVs."""

from __future__ import annotations

import csv
import io
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, variance
from typing import Any, Iterable

from app.tools.data_validation import infer_metric_columns, validate_experiment_rows


def _normal_cdf(value: float) -> float:
    return 0.5 * (1.0 + math.erf(value / math.sqrt(2.0)))


def _two_sided_normal_p(z_score: float) -> float:
    return 2.0 * (1.0 - _normal_cdf(abs(z_score)))


def load_csv_rows(path: str | Path) -> list[dict[str, str]]:
    with Path(path).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_csv_text(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def _group_rows(rows: Iterable[dict[str, Any]], group_col: str = "group") -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        group = str(row.get(group_col, "")).strip().lower()
        grouped[group].append(row)
    return grouped


def _float_values(rows: list[dict[str, Any]], metric: str) -> list[float]:
    values: list[float] = []
    for row in rows:
        raw = row.get(metric, "")
        if raw in ("", None):
            continue
        values.append(float(raw))
    return values


def check_srm(
    rows: list[dict[str, Any]],
    expected_ratio: tuple[float, float] = (0.5, 0.5),
    alpha: float = 0.01,
    group_col: str = "group",
) -> dict[str, Any]:
    grouped = _group_rows(rows, group_col=group_col)
    control_n = len(grouped.get("control", []))
    treatment_n = len(grouped.get("treatment", []))
    total = control_n + treatment_n
    if total == 0:
        return {"classification": "fail", "reason": "No control/treatment rows found."}
    expected_control = total * expected_ratio[0]
    expected_treatment = total * expected_ratio[1]
    chi_square = 0.0
    if expected_control > 0:
        chi_square += (control_n - expected_control) ** 2 / expected_control
    if expected_treatment > 0:
        chi_square += (treatment_n - expected_treatment) ** 2 / expected_treatment
    # Chi-square survival function for 1 degree of freedom.
    p_value = math.erfc(math.sqrt(chi_square / 2.0))
    return {
        "control_n": control_n,
        "treatment_n": treatment_n,
        "expected_ratio": expected_ratio,
        "chi_square": round(chi_square, 6),
        "p_value": round(p_value, 8),
        "alpha": alpha,
        "classification": "fail" if p_value < alpha else "pass",
    }


def compute_metric_lift(rows: list[dict[str, Any]], metric: str, group_col: str = "group") -> dict[str, Any]:
    grouped = _group_rows(rows, group_col=group_col)
    control = _float_values(grouped.get("control", []), metric)
    treatment = _float_values(grouped.get("treatment", []), metric)
    if not control or not treatment:
        raise ValueError(f"Metric {metric!r} needs non-empty control and treatment values.")
    control_mean = mean(control)
    treatment_mean = mean(treatment)
    lift = treatment_mean - control_mean
    lift_pct = (lift / control_mean * 100.0) if control_mean != 0 else math.inf
    control_var = variance(control) if len(control) > 1 else 0.0
    treatment_var = variance(treatment) if len(treatment) > 1 else 0.0
    standard_error = math.sqrt(control_var / len(control) + treatment_var / len(treatment))
    inference_status = "ok"
    if standard_error == 0 and lift != 0:
        ci_lower = None
        ci_upper = None
        inference_status = "degenerate_zero_variance"
    else:
        ci_lower = lift - 1.96 * standard_error
        ci_upper = lift + 1.96 * standard_error
    risk_flag = False
    # Use small practical tolerances so random noise does not turn clean wins into blockers.
    if metric == "retained_7d" and lift <= -0.01:
        risk_flag = True
    if metric == "converted" and lift <= -0.005:
        risk_flag = True
    if metric in {"complained", "reported", "hidden"} and lift >= 0.002:
        risk_flag = True
    return {
        "metric": metric,
        "control_n": len(control),
        "treatment_n": len(treatment),
        "control_mean": round(control_mean, 6),
        "treatment_mean": round(treatment_mean, 6),
        "absolute_lift": round(lift, 6),
        "lift_pct": round(lift_pct, 4),
        "standard_error": round(standard_error, 6),
        "ci_lower": round(ci_lower, 6) if ci_lower is not None else None,
        "ci_upper": round(ci_upper, 6) if ci_upper is not None else None,
        "inference_status": inference_status,
        "risk_flag": risk_flag,
    }


def run_t_test(rows: list[dict[str, Any]], metric: str, group_col: str = "group") -> dict[str, Any]:
    grouped = _group_rows(rows, group_col=group_col)
    control = _float_values(grouped.get("control", []), metric)
    treatment = _float_values(grouped.get("treatment", []), metric)
    if len(control) < 2 or len(treatment) < 2:
        raise ValueError(f"Metric {metric!r} needs at least two values per group.")
    control_var = variance(control)
    treatment_var = variance(treatment)
    standard_error = math.sqrt(control_var / len(control) + treatment_var / len(treatment))
    if standard_error == 0:
        if mean(treatment) == mean(control):
            z_score: float | None = 0.0
            p_value: float | None = 1.0
            inference_status = "constant_equal_groups"
        else:
            z_score = None
            p_value = None
            inference_status = "degenerate_zero_variance"
    else:
        z_score = (mean(treatment) - mean(control)) / standard_error
        p_value = _two_sided_normal_p(z_score)
        inference_status = "ok"
    return {
        "metric": metric,
        "test": "welch_t_approx_normal",
        "statistic": round(z_score, 6) if z_score is not None else None,
        "p_value": round(p_value, 8) if p_value is not None else None,
        "inference_status": inference_status,
        "note": "Uses a normal approximation to keep the baseline dependency-light.",
    }


def run_proportion_test(rows: list[dict[str, Any]], metric: str, group_col: str = "group") -> dict[str, Any]:
    grouped = _group_rows(rows, group_col=group_col)
    control = _float_values(grouped.get("control", []), metric)
    treatment = _float_values(grouped.get("treatment", []), metric)
    if not control or not treatment:
        raise ValueError(f"Metric {metric!r} needs non-empty control and treatment values.")
    p_control = mean(control)
    p_treatment = mean(treatment)
    pooled = (sum(control) + sum(treatment)) / (len(control) + len(treatment))
    standard_error = math.sqrt(pooled * (1 - pooled) * (1 / len(control) + 1 / len(treatment)))
    if standard_error == 0:
        z_score = 0.0
        p_value = 1.0
    else:
        z_score = (p_treatment - p_control) / standard_error
        p_value = _two_sided_normal_p(z_score)
    return {
        "metric": metric,
        "test": "two_proportion_z",
        "statistic": round(z_score, 6),
        "p_value": round(p_value, 8),
    }


def run_segment_analysis(
    rows: list[dict[str, Any]],
    metric: str,
    segment_col: str = "segment",
    group_col: str = "group",
    min_n: int = 30,
) -> list[dict[str, Any]]:
    segments = sorted({str(row.get(segment_col, "")).strip() for row in rows if row.get(segment_col)})
    summaries: list[dict[str, Any]] = []
    for segment in segments:
        segment_rows = [row for row in rows if str(row.get(segment_col, "")).strip() == segment]
        grouped = _group_rows(segment_rows, group_col=group_col)
        if (
            len(_float_values(grouped.get("control", []), metric)) < min_n
            or len(_float_values(grouped.get("treatment", []), metric)) < min_n
        ):
            continue
        summary = compute_metric_lift(segment_rows, metric, group_col=group_col)
        summary["segment"] = segment
        summaries.append(summary)
    return summaries


def generate_experiment_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    validation = validate_experiment_rows(rows)
    if not validation["valid"]:
        return {"validation": validation, "srm": None, "metric_lifts": [], "tests": [], "segments": []}
    metrics = infer_metric_columns(rows)
    selected_metrics = [
        metric
        for metric in ["revenue", "clicked", "converted", "retained_7d", "complained"]
        if metric in metrics["numeric"] or metric in metrics["binary"]
    ]
    metric_lifts = [compute_metric_lift(rows, metric) for metric in selected_metrics]
    tests: list[dict[str, Any]] = []
    for metric in selected_metrics:
        if metric in metrics["binary"]:
            tests.append(run_proportion_test(rows, metric))
        else:
            tests.append(run_t_test(rows, metric))
    segments: list[dict[str, Any]] = []
    if "segment" in validation.get("columns", []) and selected_metrics:
        for metric in selected_metrics:
            segments.extend(run_segment_analysis(rows, metric))
    return {
        "validation": validation,
        "metrics": metrics,
        "srm": check_srm(rows),
        "metric_lifts": metric_lifts,
        "tests": tests,
        "segments": segments,
    }


def generate_experiment_summary_from_path(path: str | Path) -> dict[str, Any]:
    return generate_experiment_summary(load_csv_rows(path))


def generate_experiment_summary_from_csv_text(text: str) -> dict[str, Any]:
    return generate_experiment_summary(load_csv_text(text))
