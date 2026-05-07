from __future__ import annotations

import unittest

from scripts.run_ragas_eval import (
    _needs_max_completion_tokens,
    _patch_reasoning_model_args,
    build_ragas_rows,
    classify_ragas_failures,
    summarize_metric_rows,
    summarize_metric_rows_by_category,
)


class RagasEvalTests(unittest.TestCase):
    def test_build_ragas_rows_uses_saved_answer_contexts_and_reference_fallback(self) -> None:
        rows = build_ragas_rows(
            [
                {
                    "eval_id": "q001",
                    "question": "Should we launch?",
                    "answer": "Do not launch yet.",
                    "retrieved_chunks": [{"text": "Retention is a guardrail metric."}],
                    "expected_decision": "investigate_further",
                    "expected_concepts": ["retention", "guardrail metric"],
                }
            ]
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["eval_id"], "q001")
        self.assertEqual(rows[0]["retrieved_contexts"], ["Retention is a guardrail metric."])
        self.assertIn("investigate_further", rows[0]["reference"])
        self.assertIn("retention", rows[0]["reference"])

    def test_summarize_metric_rows_handles_modern_and_legacy_metric_names(self) -> None:
        summary = summarize_metric_rows(
            [
                {
                    "faithfulness": 0.8,
                    "answer_relevancy": 0.6,
                    "context_precision": 0.7,
                    "context_recall": 0.5,
                    "answer_correctness": 0.4,
                },
                {
                    "faithfulness": 1.0,
                    "response_relevancy": 0.8,
                    "llm_context_precision_with_reference": 0.9,
                    "llm_context_recall": 0.7,
                    "answer_correctness": 0.8,
                },
            ]
        )

        self.assertEqual(summary["faithfulness"], 0.9)
        self.assertEqual(summary["answer_relevancy"], 0.7)
        self.assertEqual(summary["context_precision"], 0.8)
        self.assertEqual(summary["context_recall"], 0.6)
        self.assertEqual(summary["answer_correctness"], 0.6)

    def test_classify_ragas_failures_prefers_retrieval_failure_when_context_is_weak(self) -> None:
        failures = classify_ragas_failures(
            [
                {
                    "eval_id": "q001",
                    "user_input": "Question",
                    "faithfulness": 0.95,
                    "answer_relevancy": 0.9,
                    "context_precision": 0.2,
                    "context_recall": 0.8,
                    "answer_correctness": 0.9,
                }
            ],
            threshold=0.7,
        )

        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]["failure_hypothesis"], "retrieval_fail")
        self.assertIn("context_precision", failures[0]["weak_metrics"])

    def test_summarize_metric_rows_by_category_returns_overview_per_group(self) -> None:
        grouped = summarize_metric_rows_by_category(
            [
                {"category": "launch_decision_metric_tradeoff", "faithfulness": 1.0},
                {"category": "launch_decision_metric_tradeoff", "faithfulness": 0.8},
                {"category": "experiment_trust_validity", "faithfulness": 0.6},
            ]
        )

        self.assertEqual(grouped["launch_decision_metric_tradeoff"]["faithfulness"], 0.9)
        self.assertEqual(grouped["experiment_trust_validity"]["faithfulness"], 0.6)

    def test_gpt_5_point_model_uses_max_completion_tokens(self) -> None:
        class FakeLLM:
            model_args = {"temperature": 0.0, "top_p": 0.1, "max_tokens": 4096}

        llm = FakeLLM()
        self.assertTrue(_needs_max_completion_tokens("gpt-5.4-mini"))
        _patch_reasoning_model_args(llm, model="gpt-5.4-mini", max_tokens=4096)

        self.assertNotIn("max_tokens", llm.model_args)
        self.assertNotIn("top_p", llm.model_args)
        self.assertEqual(llm.model_args["max_completion_tokens"], 4096)


if __name__ == "__main__":
    unittest.main()
