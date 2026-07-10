from __future__ import annotations

import unittest

from app.policy_validator import validate_decision


class PolicyValidatorTests(unittest.TestCase):
    def test_srm_failure_overrides_launch(self) -> None:
        result = validate_decision(
            "The experiment has sample ratio mismatch but revenue looks higher.",
            "launch",
        )
        self.assertEqual(result["policy_decision"], "do_not_trust_result")
        self.assertEqual(result["final_decision"], "do_not_trust_result")
        self.assertTrue(result["policy_override"])

    def test_non_random_rollout_requires_quasi_experiment(self) -> None:
        result = validate_decision(
            "The feature was launched in one city with no randomized control and pre/post data.",
            "launch",
        )
        self.assertEqual(result["final_decision"], "use_did_or_quasi_experiment")

    def test_guardrail_regression_confirms_investigation(self) -> None:
        result = validate_decision(
            "Revenue increased but 7-day retention dropped.",
            "investigate_further",
        )
        self.assertEqual(result["policy_action"], "confirm")
        self.assertEqual(result["final_decision"], "investigate_further")

    def test_supportive_clean_win_never_upgrades_a_conservative_decision(self) -> None:
        result = validate_decision(
            "Revenue is significantly up, retention is stable, complaints are stable, and SRM passed.",
            "investigate_further",
        )
        self.assertFalse(result["policy_triggered"])
        self.assertEqual(result["policy_action"], "none")
        self.assertEqual(result["final_decision"], "investigate_further")
        self.assertTrue(any(item["severity"] == "supportive" for item in result["policy_findings"]))

    def test_ads_quality_drop_requires_investigation(self) -> None:
        result = validate_decision(
            "An ads experiment increased CTR but lowered advertiser conversion quality and ROAS.",
            "do_not_launch",
        )
        self.assertIsNone(result["policy_decision"])
        self.assertEqual(result["final_decision"], "do_not_launch")

    def test_confidence_interval_downside_requires_investigation(self) -> None:
        result = validate_decision(
            "The primary metric improved, but the confidence interval includes meaningful downside on retention.",
            "launch",
        )
        self.assertEqual(result["policy_decision"], "investigate_further")

    def test_non_significant_revenue_lift_is_not_a_clean_win(self) -> None:
        tool_summary = {
            "validation": {"valid": True},
            "srm": {"classification": "pass"},
            "metric_lifts": [
                {"metric": "revenue", "absolute_lift": 0.1, "ci_lower": 0.01, "risk_flag": False},
                {"metric": "converted", "absolute_lift": 0.0, "ci_lower": -0.01, "risk_flag": False},
            ],
            "tests": [{"metric": "revenue", "p_value": 0.2}],
            "segments": [],
        }
        result = validate_decision("Should we launch this experiment?", "investigate_further", tool_summary=tool_summary)
        self.assertEqual(result["final_decision"], "investigate_further")

    def test_significant_revenue_lift_can_confirm_an_existing_launch(self) -> None:
        tool_summary = {
            "validation": {"valid": True, "columns": ["revenue", "converted", "retained_7d", "complained"]},
            "srm": {"classification": "pass"},
            "metric_lifts": [
                {"metric": "revenue", "absolute_lift": 0.5, "ci_lower": 0.2, "risk_flag": False},
                {"metric": "converted", "absolute_lift": 0.0, "ci_lower": -0.01, "risk_flag": False},
                {"metric": "retained_7d", "absolute_lift": 0.0, "ci_lower": -0.01, "risk_flag": False},
                {"metric": "complained", "absolute_lift": 0.0, "ci_lower": -0.01, "risk_flag": False},
            ],
            "tests": [{"metric": "revenue", "p_value": 0.01}],
            "segments": [],
        }
        result = validate_decision("Should we launch this experiment?", "launch", tool_summary=tool_summary)
        self.assertEqual(result["final_decision"], "launch")
        self.assertEqual(result["policy_action"], "confirm")

    def test_invalid_uploaded_data_blocks_launch(self) -> None:
        result = validate_decision(
            "Should we launch this experiment?",
            "launch",
            tool_summary={"validation": {"valid": False, "errors": ["Missing treatment group."]}},
        )
        self.assertEqual(result["policy_decision"], "do_not_trust_result")
        self.assertEqual(result["final_decision"], "do_not_trust_result")


if __name__ == "__main__":
    unittest.main()
