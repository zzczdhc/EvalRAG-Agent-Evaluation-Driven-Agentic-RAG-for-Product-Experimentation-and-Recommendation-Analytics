"""RAG orchestration, LLM generation, policy validation, telemetry, and evaluation."""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.chunking import build_chunks, load_chunks
from app.concept_coverage import evaluate_concepts
from app.concept_judge import judge_concepts
from app.config import PLAYBOOK_DIR, settings
from app.corpus import resolve_corpus_sources
from app.graph import GraphDependencies, run_workflow
from app.llm_generator import LLMGenerationConfig, LLMGenerationError, generate_llm_answer
from app.policy_validator import validate_decision
from app.retrieval import (
    SimpleHybridRetriever,
    results_to_dicts,
)
from app.telemetry import append_log, new_query_id, utc_timestamp


DECISIONS = {
    "launch",
    "do_not_launch",
    "investigate_further",
    "partial_rollout",
    "do_not_trust_result",
    "use_did_or_quasi_experiment",
}
UNKNOWN_DECISION = "unknown"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def extract_decision(answer: str) -> str:
    """Extract the exact decision label the LLM placed in the decision section."""

    section_match = re.search(
        r"##\s*Decision Recommendation\s*(.*?)(?:\n##\s+|\Z)",
        answer,
        flags=re.IGNORECASE | re.DOTALL,
    )
    search_space = section_match.group(1) if section_match else answer
    normalized = normalize_text(search_space)
    for decision in sorted(DECISIONS, key=len, reverse=True):
        pattern = rf"(?<![a-z0-9_]){re.escape(decision)}(?![a-z0-9_])"
        if re.search(pattern, normalized):
            return decision
    return UNKNOWN_DECISION


def _replace_decision_section(answer: str, final_decision: str) -> str:
    pattern = r"(##\s*Decision Recommendation\s*\n)(.*?)(?=\n##\s+|\Z)"
    replacement = rf"\1`{final_decision}`\n"
    updated, count = re.subn(pattern, replacement, answer, count=1, flags=re.IGNORECASE | re.DOTALL)
    if count:
        return updated
    return answer.rstrip() + f"\n\n## Decision Recommendation\n`{final_decision}`\n"


def _policy_validation_markdown(policy_validation: dict[str, Any]) -> str:
    findings = policy_validation.get("policy_findings", [])
    if not findings:
        return ""
    llm_decision = policy_validation.get("llm_decision")
    final_decision = policy_validation.get("final_decision")
    action = policy_validation.get("policy_action")
    if action == "override":
        lead = f"Policy validation changed the LLM proposal from `{llm_decision}` to `{final_decision}`."
    else:
        lead = f"Policy validation confirmed the LLM decision `{final_decision}`."
    lines = ["## Policy Validation", lead, "", "Triggered policies:"]
    for finding in findings[:4]:
        lines.append(
            f"- `{finding['policy_id']}` -> `{finding['recommended_decision']}`: {finding['reason']}"
        )
    return "\n".join(lines).rstrip() + "\n"


def apply_policy_validation_to_answer(answer: str, policy_validation: dict[str, Any]) -> str:
    """Align visible memo text with the final policy-validated decision."""

    if not policy_validation.get("policy_triggered"):
        return answer
    final_decision = str(policy_validation.get("final_decision", UNKNOWN_DECISION))
    updated = _replace_decision_section(answer, final_decision)
    section = _policy_validation_markdown(policy_validation)
    if not section:
        return updated
    if "## Policy Validation" in updated:
        return updated
    if re.search(r"\n##\s*Retrieved Sources", updated, flags=re.IGNORECASE):
        return re.sub(
            r"\n##\s*Retrieved Sources",
            "\n\n" + section + "\n## Retrieved Sources",
            updated,
            count=1,
            flags=re.IGNORECASE,
        )
    return updated.rstrip() + "\n\n" + section


def evaluate_trace(
    answer: str,
    retrieved_sources: list[str],
    decision: str,
    expected_sources: list[str] | None = None,
    expected_concepts: list[str] | None = None,
    expected_decision: str | None = None,
    llm_decision: str | None = None,
    policy_decision: str | None = None,
    policy_validation: dict[str, Any] | None = None,
    concept_judge: Callable[[str, list[str]], list[dict[str, Any]]] | None = None,
    concept_coverage_target: float | None = None,
) -> dict[str, Any]:
    expected_sources = expected_sources or []
    expected_concepts = expected_concepts or []
    unique_retrieved_sources = list(dict.fromkeys(retrieved_sources))
    source_set = set(unique_retrieved_sources)
    expected_source_set = set(expected_sources)
    matched_sources = [source for source in expected_sources if source in source_set]
    missing_sources = [source for source in expected_sources if source not in source_set]
    unexpected_sources = [source for source in unique_retrieved_sources if source not in expected_source_set]
    concept_result = evaluate_concepts(
        answer,
        expected_concepts,
        coverage_target=concept_coverage_target or settings.concept_coverage_failure_threshold,
        llm_judge=concept_judge,
        judge_min_confidence=settings.concept_judge_min_confidence,
    )
    source_hit = bool(expected_source_set and matched_sources)
    source_match_rate = round(len(matched_sources) / len(expected_source_set), 4) if expected_source_set else None
    all_sources_found = len(matched_sources) == len(expected_source_set) if expected_source_set else None
    top1_source_match = (
        unique_retrieved_sources[0] in expected_source_set
        if expected_source_set and unique_retrieved_sources
        else None
    )
    source_precision_at_k = (
        round(len([source for source in unique_retrieved_sources if source in expected_source_set]) / len(unique_retrieved_sources), 4)
        if unique_retrieved_sources and expected_source_set
        else None
    )
    expected_available = bool(expected_decision)
    has_policy_validation = policy_validation is not None
    policy_validation = policy_validation or {}
    return {
        "source_hit": source_hit,
        "source_match_rate": source_match_rate,
        "all_expected_sources_found": all_sources_found,
        "top1_source_match": top1_source_match,
        "source_precision_at_k": source_precision_at_k,
        "matched_sources": matched_sources,
        "missing_sources": missing_sources,
        "unexpected_sources": unexpected_sources,
        "concept_coverage": concept_result["concept_coverage"],
        "deterministic_concept_coverage": concept_result["deterministic_concept_coverage"],
        "covered_concepts": concept_result["covered_concepts"],
        "missing_concepts": concept_result["missing_concepts"],
        "concept_matches": concept_result["concept_matches"],
        "concept_coverage_method": concept_result["concept_coverage_method"],
        "concept_judge_used": concept_result["concept_judge_used"],
        "concept_judge_error": concept_result["concept_judge_error"],
        "decision_correct": decision == expected_decision if expected_available else None,
        "llm_decision_correct": llm_decision == expected_decision if expected_available and llm_decision else None,
        "policy_decision_correct": policy_decision == expected_decision if expected_available and policy_decision else None,
        "policy_triggered": bool(policy_validation.get("policy_triggered")) if has_policy_validation else None,
        "policy_override": bool(policy_validation.get("policy_override")) if has_policy_validation else None,
    }


def _primary_llm_config() -> LLMGenerationConfig:
    return LLMGenerationConfig(
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        timeout_seconds=settings.llm_timeout_seconds,
        token_parameter=settings.llm_token_parameter,
    )


def _fallback_llm_config() -> LLMGenerationConfig:
    return LLMGenerationConfig(
        base_url=settings.fallback_llm_base_url,
        model=settings.fallback_llm_model,
        api_key=settings.fallback_llm_api_key,
        temperature=settings.fallback_llm_temperature,
        max_tokens=settings.fallback_llm_max_tokens,
        timeout_seconds=settings.fallback_llm_timeout_seconds,
        token_parameter=settings.fallback_llm_token_parameter,
    )


def _concept_judge_config() -> LLMGenerationConfig:
    return LLMGenerationConfig(
        base_url=settings.concept_judge_base_url,
        model=settings.concept_judge_model,
        api_key=settings.concept_judge_api_key,
        temperature=settings.concept_judge_temperature,
        max_tokens=settings.concept_judge_max_tokens,
        timeout_seconds=settings.concept_judge_timeout_seconds,
        token_parameter=settings.concept_judge_token_parameter,
    )


def _concept_judge_callback() -> Callable[[str, list[str]], list[dict[str, Any]]]:
    config = _concept_judge_config()

    def judge(answer: str, concepts: list[str]) -> list[dict[str, Any]]:
        return judge_concepts(
            answer,
            concepts,
            config,
            min_confidence=settings.concept_judge_min_confidence,
        )

    return judge


class EvalRAGPipeline:
    def __init__(
        self,
        index_path: Path | None = None,
        playbook_dir: Path = PLAYBOOK_DIR,
        top_k: int | None = None,
        alpha: float | None = None,
    ) -> None:
        self.index_path = Path(index_path or settings.index_path)
        self.playbook_dir = playbook_dir
        self.top_k = top_k or settings.top_k
        self.alpha = settings.hybrid_alpha if alpha is None else alpha
        if self.index_path.exists():
            chunks = load_chunks(self.index_path)
        else:
            chunks = build_chunks(
                playbook_dir,
                settings.chunk_size,
                settings.chunk_overlap,
                semantic_enabled=settings.chunk_semantic_enable,
                semantic_model=settings.chunk_semantic_model,
                semantic_device=settings.chunk_semantic_device,
                semantic_offline=settings.chunk_semantic_offline,
                semantic_min_size=settings.chunk_semantic_min_size,
            )
        self.retriever = SimpleHybridRetriever(chunks, alpha=self.alpha)

    def retrieve(self, question: str, selected_sources: list[str] | None = None) -> list[dict[str, Any]]:
        retrieved_results = self.retriever.search(
            question,
            top_k=self.top_k,
            alpha=self.alpha,
            source_filter=selected_sources,
        )
        return results_to_dicts(retrieved_results)

    def answer(
        self,
        question: str,
        expected_sources: list[str] | None = None,
        expected_concepts: list[str] | None = None,
        expected_decision: str | None = None,
        selected_corpus_ids: list[str] | None = None,
        tool_summary: dict[str, Any] | None = None,
        log: bool = True,
        concept_judge_enabled: bool | None = None,
        csv_text: str | None = None,
    ) -> dict[str, Any]:
        selected_sources = resolve_corpus_sources(selected_corpus_ids)

        def retrieve_with_corpus_filter(query: str) -> list[dict[str, Any]]:
            return self.retrieve(query, selected_sources=selected_sources)

        deps = GraphDependencies(
            retrieve_fn=retrieve_with_corpus_filter,
            generate_llm_answer_fn=generate_llm_answer,
            validate_decision_fn=validate_decision,
            evaluate_trace_fn=evaluate_trace,
            extract_decision_fn=extract_decision,
            apply_policy_validation_to_answer_fn=apply_policy_validation_to_answer,
            primary_llm_config_fn=_primary_llm_config,
            fallback_llm_config_fn=_fallback_llm_config,
            concept_judge_callback_fn=_concept_judge_callback,
        )
        final_state = run_workflow(
            {
                "question": question,
                "csv_text": csv_text,
                "tool_summary": tool_summary,
                "selected_corpus_ids": selected_corpus_ids or [],
                "selected_sources": selected_sources,
                "expected_sources": expected_sources or [],
                "expected_concepts": expected_concepts or [],
                "expected_decision": expected_decision,
                "generator_backend": settings.generator_backend,
                "model": settings.llm_model,
                "retry_count": 0,
                "max_retries": 1,
                "errors": [],
                "log": log,
                "top_k": self.top_k,
                "alpha": self.alpha,
            },
            deps,
        )

        retrieved = final_state.get("retrieved_chunks", [])
        llm_decision = final_state.get("llm_decision", UNKNOWN_DECISION)
        policy_validation = final_state.get("policy_validation", {})
        final_decision = str(final_state.get("final_decision", llm_decision))
        answer = str(final_state.get("answer", ""))
        evaluation = final_state.get("evaluation", {})
        latency = round(float(final_state.get("latency_seconds", 0.0)), 4)
        record = {
            "query_id": final_state["query_id"],
            "timestamp": utc_timestamp(),
            "question": question,
            "retrieved_chunks": [
                {
                    **item,
                    "text_preview": item["text"][:240],
                }
                for item in retrieved
            ],
            "answer": answer,
            "llm_decision": llm_decision,
            "policy_decision": policy_validation.get("policy_decision"),
            "final_decision": final_decision,
            "decision": final_decision,
            "policy_validation": policy_validation,
            "expected_sources": expected_sources or [],
            "expected_concepts": expected_concepts or [],
            "expected_decision": expected_decision,
            "selected_corpus_ids": selected_corpus_ids or [],
            "selected_sources": selected_sources,
            "evaluation": evaluation,
            "latency_seconds": latency,
            "model": final_state.get("model", settings.llm_model),
            "generator_backend": final_state.get("generator_backend", settings.generator_backend),
            "concept_judge_enabled": bool(settings.concept_judge_enabled if concept_judge_enabled is None else concept_judge_enabled),
            "concept_judge_model": settings.concept_judge_model if (settings.concept_judge_enabled if concept_judge_enabled is None else concept_judge_enabled) else None,
            "decision_json": final_state.get("decision_json"),
            "task_type": final_state.get("task_type"),
            "required_tools": final_state.get("required_tools", []),
            "agent_plan": final_state.get("agent_plan"),
            "evidence_bundle": final_state.get("evidence_bundle"),
            "evidence_check": final_state.get("evidence_check"),
            "evidence_sufficiency": final_state.get("evidence_sufficiency"),
            "trace_steps": final_state.get("trace_steps", []),
        }
        if final_state.get("llm_answer_before_policy"):
            record["llm_answer_before_policy"] = final_state["llm_answer_before_policy"]
        if final_state.get("generator_error"):
            record["generator_error"] = final_state["generator_error"]
        if final_state.get("fallback_error"):
            record["fallback_error"] = final_state["fallback_error"]
        if llm_decision == UNKNOWN_DECISION:
            record["decision_parse_error"] = "LLM answer did not contain one allowed decision label."
        if final_state.get("tool_summary") is not None:
            record["tool_summary"] = final_state.get("tool_summary")
        if log:
            append_log(record)
        return record


def record_to_public_response(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "query_id": record["query_id"],
        "answer": record["answer"],
        "decision": record["decision"],
        "llm_decision": record.get("llm_decision"),
        "policy_decision": record.get("policy_decision"),
        "final_decision": record.get("final_decision", record["decision"]),
        "policy_validation": record.get("policy_validation", {}),
        "retrieved_chunks": record["retrieved_chunks"],
        "evaluation": record["evaluation"],
        "trace": {
            "query_id": record.get("query_id"),
            "task_type": record.get("task_type"),
            "required_tools": record.get("required_tools", []),
            "agent_plan": record.get("agent_plan"),
            "selected_corpus_ids": record.get("selected_corpus_ids", []),
            "selected_sources": record.get("selected_sources", []),
            "evidence_sufficiency": record.get("evidence_sufficiency"),
            "evidence_check": record.get("evidence_check"),
            "trace_steps": record.get("trace_steps", []),
            "decision_json": record.get("decision_json"),
            "policy_validation": record.get("policy_validation", {}),
            "generator_backend": record.get("generator_backend", "openai_compatible"),
            "model": record.get("model"),
        },
        "latency_seconds": record["latency_seconds"],
        "model": record["model"],
        "generator_backend": record.get("generator_backend", "openai_compatible"),
        "generator_error": record.get("generator_error"),
        "concept_judge_enabled": record.get("concept_judge_enabled", False),
        "concept_judge_model": record.get("concept_judge_model"),
    }
