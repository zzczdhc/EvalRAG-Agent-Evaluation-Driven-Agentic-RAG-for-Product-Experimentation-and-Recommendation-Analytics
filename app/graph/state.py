"""State schema for the bounded experimentation analyst graph."""

from __future__ import annotations

from typing import Any, TypedDict


class ExperimentGraphState(TypedDict, total=False):
    query_id: str
    question: str
    csv_text: str | None
    task_type: str | None
    agent_plan: dict[str, Any] | None
    required_tools: list[str]
    tool_results: dict[str, Any]
    tool_summary: dict[str, Any] | None
    selected_corpus_ids: list[str]
    selected_sources: list[str]
    retrieved_chunks: list[dict[str, Any]]
    evidence_bundle: dict[str, Any] | None
    evidence_check: dict[str, Any] | None
    evidence_sufficiency: str | None
    decision_json: dict[str, Any] | None
    policy_validation: dict[str, Any] | None
    answer: str | None
    evaluation: dict[str, Any] | None
    trace_steps: list[dict[str, Any]]
    retry_count: int
    max_retries: int
    errors: list[str]
    latency_seconds: float | None
    model: str | None
    generator_backend: str | None
    generator_error: str | None
    fallback_error: str | None
    llm_answer_before_policy: str | None
    llm_decision: str | None
    policy_decision: str | None
    final_decision: str | None
    expected_sources: list[str]
    expected_concepts: list[str]
    expected_decision: str | None
    log: bool
    top_k: int | None
    alpha: float | None
    _started_at: float
    _retrieval_query: str | None
