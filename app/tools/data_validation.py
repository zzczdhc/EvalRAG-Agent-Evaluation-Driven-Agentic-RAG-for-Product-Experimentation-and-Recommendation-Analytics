"""CSV validation helpers for experiment data."""

from __future__ import annotations

import math
from collections import Counter
from typing import Any


REQUIRED_COLUMNS = {"user_id", "group"}
MAX_ROWS = 100_000
CANONICAL_NUMERIC_METRICS = {
    "revenue",
    "clicked",
    "converted",
    "retained_7d",
    "complained",
    "reported",
    "hidden",
}
CANONICAL_BINARY_METRICS = {
    "clicked",
    "converted",
    "retained_7d",
    "complained",
    "reported",
    "hidden",
}


def validate_experiment_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"valid": False, "errors": ["CSV contains no rows."], "warnings": []}
    columns = {column for row in rows for column in row.keys()}
    missing = sorted(REQUIRED_COLUMNS - columns)
    errors = [f"Missing required column: {column}" for column in missing]
    warnings: list[str] = []

    if len(rows) > MAX_ROWS:
        errors.append(f"CSV exceeds the {MAX_ROWS:,}-row analysis limit.")

    group_values = [str(row.get("group", "")).strip().lower() for row in rows]
    group_counts = Counter(value for value in group_values if value)
    groups = set(group_counts)
    missing_groups = sorted({"control", "treatment"} - groups)
    unexpected_groups = sorted(groups - {"control", "treatment"})
    if missing_groups:
        errors.append(f"Missing experiment group(s): {', '.join(missing_groups)}.")
    if unexpected_groups:
        errors.append(f"Unexpected group value(s): {', '.join(unexpected_groups)}. Use only control and treatment.")
    if any(not value for value in group_values):
        errors.append("Every row must contain a control or treatment group value.")
    for group in ("control", "treatment"):
        if 0 < group_counts.get(group, 0) < 2:
            errors.append(f"Group {group!r} needs at least two rows for statistical testing.")

    if "user_id" in columns:
        user_ids = [str(row.get("user_id", "")).strip() for row in rows]
        if any(not user_id for user_id in user_ids):
            errors.append("Every row must contain a non-empty user_id.")
        duplicate_count = len(user_ids) - len(set(user_ids))
        if duplicate_count:
            errors.append(f"CSV contains {duplicate_count} duplicate user_id row(s).")

    numeric_errors: list[str] = []
    for metric in sorted(CANONICAL_NUMERIC_METRICS & columns):
        missing_values = 0
        usable_by_group: Counter[str] = Counter()
        metric_invalid = False
        for row_number, row in enumerate(rows, start=2):
            raw = str(row.get(metric, "")).strip()
            if not raw:
                missing_values += 1
                continue
            try:
                value = float(raw)
            except ValueError:
                numeric_errors.append(f"{metric} has a non-numeric value on row {row_number}.")
                metric_invalid = True
                break
            if not math.isfinite(value):
                numeric_errors.append(f"{metric} has a non-finite value on row {row_number}.")
                metric_invalid = True
                break
            if metric in CANONICAL_BINARY_METRICS and value not in {0.0, 1.0}:
                numeric_errors.append(f"{metric} must contain only 0 or 1; found {raw!r} on row {row_number}.")
                metric_invalid = True
                break
            group = str(row.get("group", "")).strip().lower()
            if group in {"control", "treatment"}:
                usable_by_group[group] += 1
        if not metric_invalid:
            for group in ("control", "treatment"):
                if group_counts.get(group, 0) and usable_by_group.get(group, 0) < 2:
                    numeric_errors.append(f"{metric} needs at least two usable values in the {group} group.")
        if missing_values:
            warnings.append(f"{metric} has {missing_values} missing value(s); calculations use available rows.")
    errors.extend(numeric_errors)

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "columns": sorted(columns),
        "row_count": len(rows),
        "group_counts": dict(group_counts),
    }


def infer_metric_columns(rows: list[dict[str, Any]]) -> dict[str, list[str]]:
    if not rows:
        return {"numeric": [], "binary": [], "categorical": []}
    ignored = {"user_id", "group", "segment", "device", "country", "date", "market", "city"}
    numeric: list[str] = []
    binary: list[str] = []
    categorical: list[str] = []
    for column in rows[0].keys():
        if column in ignored:
            continue
        values = [str(row.get(column, "")).strip() for row in rows if str(row.get(column, "")).strip() != ""]
        if not values:
            continue
        parsed: list[float] = []
        all_numeric = True
        for value in values:
            try:
                parsed_value = float(value)
                if not math.isfinite(parsed_value):
                    all_numeric = False
                    break
                parsed.append(parsed_value)
            except ValueError:
                all_numeric = False
                break
        if not all_numeric:
            categorical.append(column)
            continue
        unique = {value for value in parsed}
        if unique.issubset({0.0, 1.0}):
            binary.append(column)
        else:
            numeric.append(column)
    return {"numeric": numeric, "binary": binary, "categorical": categorical}
