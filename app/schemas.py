"""FastAPI request and response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3)
    selected_corpus_ids: list[str] = Field(default_factory=list)
    expected_sources: list[str] = Field(default_factory=list)
    expected_concepts: list[str] = Field(default_factory=list)
    expected_decision: str | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)


class AskResponse(BaseModel):
    query_id: str
    answer: str
    decision: str
    llm_decision: str | None = None
    policy_decision: str | None = None
    final_decision: str | None = None
    policy_validation: dict[str, Any] = Field(default_factory=dict)
    retrieved_chunks: list[dict[str, Any]]
    evaluation: dict[str, Any]
    trace: dict[str, Any] = Field(default_factory=dict)
    latency_seconds: float
    model: str
    generator_backend: str = "openai_compatible"
    generator_error: str | None = None
    concept_judge_enabled: bool = False
    concept_judge_model: str | None = None


class AnalyzeResponse(AskResponse):
    tool_summary: dict[str, Any]
