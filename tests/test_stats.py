from __future__ import annotations

import unittest
from pathlib import Path

from app.tools.data_validation import validate_experiment_rows
from app.tools.experiment_stats import check_srm, compute_metric_lift, generate_experiment_summary, load_csv_text, run_t_test


class ExperimentStatsTests(unittest.TestCase):
    def test_srm_fails_for_large_imbalance(self) -> None:
        rows = [{"group": "control"}, {"group": "control"}] + [{"group": "treatment"} for _ in range(18)]
        result = check_srm(rows)
        self.assertEqual(result["classification"], "fail")

    def test_metric_lift(self) -> None:
        rows = [
            {"group": "control", "revenue": "10"},
            {"group": "control", "revenue": "20"},
            {"group": "treatment", "revenue": "15"},
            {"group": "treatment", "revenue": "25"},
        ]
        result = compute_metric_lift(rows, "revenue")
        self.assertEqual(result["control_mean"], 15)
        self.assertEqual(result["treatment_mean"], 20)
        self.assertAlmostEqual(result["lift_pct"], 33.3333, places=3)
        self.assertIn("ci_lower", result)
        self.assertIn("ci_upper", result)

    def test_validation_rejects_duplicate_users_and_missing_treatment(self) -> None:
        result = validate_experiment_rows([
            {"user_id": "u1", "group": "control", "revenue": "1"},
            {"user_id": "u1", "group": "control", "revenue": "2"},
        ])
        self.assertFalse(result["valid"])
        self.assertTrue(any("treatment" in error for error in result["errors"]))
        self.assertTrue(any("duplicate" in error for error in result["errors"]))

    def test_segment_analysis_includes_guardrail_metrics(self) -> None:
        rows = load_csv_text(Path("data/synthetic/segment_harm.csv").read_text(encoding="utf-8"))
        result = generate_experiment_summary(rows)
        segment_metrics = {item["metric"] for item in result["segments"]}
        self.assertIn("retained_7d", segment_metrics)
        self.assertIn("complained", segment_metrics)

    def test_validation_rejects_missing_arm_values_and_non_binary_values(self) -> None:
        rows = [
            {"user_id": "c1", "group": "control", "converted": "0"},
            {"user_id": "c2", "group": "control", "converted": "2"},
            {"user_id": "t1", "group": "treatment", "converted": ""},
            {"user_id": "t2", "group": "treatment", "converted": ""},
        ]
        result = validate_experiment_rows(rows)
        self.assertFalse(result["valid"])
        self.assertTrue(any("only 0 or 1" in error for error in result["errors"]))

    def test_zero_variance_with_different_means_is_reported_as_degenerate(self) -> None:
        rows = [
            {"group": "control", "revenue": "1"},
            {"group": "control", "revenue": "1"},
            {"group": "treatment", "revenue": "2"},
            {"group": "treatment", "revenue": "2"},
        ]
        lift = compute_metric_lift(rows, "revenue")
        test = run_t_test(rows, "revenue")
        self.assertIsNone(lift["ci_lower"])
        self.assertIsNone(test["p_value"])
        self.assertEqual(test["inference_status"], "degenerate_zero_variance")


if __name__ == "__main__":
    unittest.main()
