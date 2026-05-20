#!/usr/bin/env python3
"""Generate synthetic A/B experiment CSVs for the agentic tools."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "data" / "synthetic"


def bernoulli(probability: float) -> int:
    return int(random.random() < probability)


def revenue(mean: float, sd: float = 1.2) -> float:
    return round(max(0.0, random.gauss(mean, sd)), 2)


def write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = ["user_id", "group", "revenue", "clicked", "converted", "retained_7d", "complained", "segment", "device", "country"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def make_rows(
    name: str,
    control_n: int,
    treatment_n: int,
    control: dict[str, float],
    treatment: dict[str, float],
    segment_harm: bool = False,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    segments = ["new_user", "returning_user", "high_value"]
    devices = ["ios", "android", "web"]
    countries = ["US", "CA", "GB", "DE"]
    for group, size, params in [("control", control_n, control), ("treatment", treatment_n, treatment)]:
        for idx in range(size):
            segment = random.choices(segments, weights=[0.35, 0.45, 0.20])[0]
            retained_prob = params["retained_7d"]
            revenue_mean = params["revenue"]
            if segment_harm and group == "treatment" and segment == "high_value":
                retained_prob -= 0.08
                revenue_mean -= 0.8
            rows.append(
                {
                    "user_id": f"{name}_{group}_{idx:05d}",
                    "group": group,
                    "revenue": revenue(revenue_mean),
                    "clicked": bernoulli(params["clicked"]),
                    "converted": bernoulli(params["converted"]),
                    "retained_7d": bernoulli(retained_prob),
                    "complained": bernoulli(params["complained"]),
                    "segment": segment,
                    "device": random.choice(devices),
                    "country": random.choice(countries),
                }
            )
    random.shuffle(rows)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n", type=int, default=2000)
    args = parser.parse_args()
    random.seed(args.seed)

    scenarios = {
        "clean_win.csv": make_rows(
            "clean_win",
            args.n,
            args.n,
            {"revenue": 10.0, "clicked": 0.22, "converted": 0.080, "retained_7d": 0.42, "complained": 0.012},
            {"revenue": 10.8, "clicked": 0.260, "converted": 0.100, "retained_7d": 0.50, "complained": 0.006},
        ),
        "guardrail_failure.csv": make_rows(
            "guardrail_failure",
            args.n,
            args.n,
            {"revenue": 10.0, "clicked": 0.22, "converted": 0.082, "retained_7d": 0.42, "complained": 0.010},
            {"revenue": 10.6, "clicked": 0.250, "converted": 0.084, "retained_7d": 0.385, "complained": 0.014},
        ),
        "srm_failure.csv": make_rows(
            "srm_failure",
            int(args.n * 0.60),
            int(args.n * 1.40),
            {"revenue": 10.0, "clicked": 0.22, "converted": 0.082, "retained_7d": 0.42, "complained": 0.010},
            {"revenue": 10.8, "clicked": 0.245, "converted": 0.088, "retained_7d": 0.421, "complained": 0.010},
        ),
        "ctr_up_cvr_down.csv": make_rows(
            "ctr_up_cvr_down",
            args.n,
            args.n,
            {"revenue": 10.0, "clicked": 0.22, "converted": 0.086, "retained_7d": 0.42, "complained": 0.010},
            {"revenue": 9.8, "clicked": 0.270, "converted": 0.071, "retained_7d": 0.418, "complained": 0.011},
        ),
        "segment_harm.csv": make_rows(
            "segment_harm",
            args.n,
            args.n,
            {"revenue": 10.0, "clicked": 0.22, "converted": 0.082, "retained_7d": 0.42, "complained": 0.010},
            {"revenue": 10.5, "clicked": 0.242, "converted": 0.087, "retained_7d": 0.422, "complained": 0.010},
            segment_harm=True,
        ),
    }

    for filename, rows in scenarios.items():
        path = args.output_dir / filename
        write_rows(path, rows)
        print(f"Wrote {len(rows)} rows -> {path}")


if __name__ == "__main__":
    main()
