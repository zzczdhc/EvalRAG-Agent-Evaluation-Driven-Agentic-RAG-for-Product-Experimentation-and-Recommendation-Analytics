from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from app.rag_pipeline import EvalRAGPipeline, record_to_public_response


def _memo_for(decision: str, source: str = "launch_decision.md") -> str:
    return f"""## Short Answer
Working answer.

## Decision Recommendation
`{decision}`

## Reasoning
- Retrieved evidence supports the recommendation.

## Metrics to Check
- revenue

## Suggested Next Steps
1. Review the evidence bundle.

## Risks / Caveats
- Evidence may still be incomplete.

## Retrieved Sources
- {source}
"""


class GraphWorkflowTests(unittest.TestCase):
    def test_plain_question_runs_full_graph(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("investigate_further", "guardrail_metrics.md")):
            record = pipeline.answer(
                "Revenue increased, but 7-day retention dropped. Should we launch?",
                expected_sources=["guardrail_metrics.md"],
                expected_decision="investigate_further",
                log=False,
            )

        self.assertEqual(record["task_type"], "guardrail_regression")
        self.assertIn("retrieve_playbook_rules", record["required_tools"])
        self.assertIn("decision", record["decision_json"])
        self.assertEqual(record["decision_json"]["decision"], "investigate_further")
        self.assertIsInstance(record["evidence_bundle"], dict)
        self.assertIn("policy_validation", record)
        self.assertIn("memo_decision_consistent", record["evaluation"])

    def test_csv_input_triggers_tool_execution_and_tool_summary(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        csv_text = Path("data/synthetic/clean_win.csv").read_text(encoding="utf-8")
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch")):
            record = pipeline.answer(
                "Should we launch this recommendation experiment?",
                csv_text=csv_text,
                log=False,
            )

        self.assertIn("tool_summary", record)
        self.assertIn("validation", record["tool_summary"])
        self.assertIn("srm", record["tool_summary"])
        self.assertIn("metric_lifts", record["tool_summary"])
        self.assertTrue(record["evaluation"]["tools_used"])

    def test_srm_failure_leads_to_do_not_trust_result(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        csv_text = Path("data/synthetic/srm_failure.csv").read_text(encoding="utf-8")
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch")):
            record = pipeline.answer(
                "Treatment has 30% more users than control in a planned 50/50 experiment. Can we trust the result?",
                csv_text=csv_text,
                log=False,
            )

        self.assertEqual(record["decision"], "do_not_trust_result")
        self.assertEqual(record["decision_json"]["decision"], "do_not_trust_result")

    def test_invalid_csv_leads_to_do_not_trust_result(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        csv_text = "user_id,group,revenue\nu1,control,10\nu1,control,11\n"
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch")):
            record = pipeline.answer(
                "Revenue increased. Should we launch?",
                csv_text=csv_text,
                log=False,
            )

        self.assertFalse(record["tool_summary"]["validation"]["valid"])
        self.assertEqual(record["decision"], "do_not_trust_result")
        self.assertEqual(record["decision_json"]["decision"], "do_not_trust_result")

    def test_non_random_rollout_leads_to_quasi_experiment(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch", "did_policy_analysis.md")):
            record = pipeline.answer(
                "The feature was launched in one city with no randomized control and pre/post market data.",
                log=False,
            )

        self.assertEqual(record["decision"], "use_did_or_quasi_experiment")
        self.assertEqual(record["task_type"], "quasi_experiment")

    def test_segment_harm_leads_to_partial_or_investigate(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch", "segment_analysis.md")):
            record = pipeline.answer(
                "Overall metrics look positive, but Android users in Germany show a large negative retention effect.",
                log=False,
            )

        self.assertIn(record["decision"], {"partial_rollout", "investigate_further"})

    def test_guardrail_regression_blocks_full_launch(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch", "guardrail_metrics.md")):
            record = pipeline.answer(
                "Revenue increased, but 7-day retention dropped.",
                log=False,
            )

        self.assertNotEqual(record["decision"], "launch")

    def test_memo_decision_matches_decision_json(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("launch", "guardrail_metrics.md")):
            record = pipeline.answer(
                "Revenue increased, but 7-day retention dropped.",
                log=False,
            )

        self.assertEqual(record["evaluation"]["memo_decision_consistent"], True)
        self.assertEqual(record["decision_json"]["decision"], record["decision"])

    def test_public_response_shape_remains_backward_compatible(self) -> None:
        pipeline = EvalRAGPipeline(top_k=3, alpha=0.65)
        with patch("app.rag_pipeline.generate_llm_answer", return_value=_memo_for("investigate_further", "guardrail_metrics.md")):
            record = pipeline.answer("Revenue increased, but retention dropped.", log=False)
        public = record_to_public_response(record)

        for key in [
            "query_id",
            "answer",
            "decision",
            "llm_decision",
            "policy_decision",
            "final_decision",
            "policy_validation",
            "retrieved_chunks",
            "evaluation",
            "latency_seconds",
            "model",
            "generator_backend",
        ]:
            self.assertIn(key, public)


if __name__ == "__main__":
    unittest.main()
