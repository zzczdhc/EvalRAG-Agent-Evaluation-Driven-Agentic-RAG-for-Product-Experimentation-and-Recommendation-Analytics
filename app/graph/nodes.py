"""Node implementations for the bounded experimentation analyst graph."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Callable

from app.config import settings
from app.graph.state import ExperimentGraphState
from app.llm_generator import LLMGenerationError
from app.tools.data_validation import infer_metric_columns, validate_experiment_rows
from app.tools.experiment_stats import (
    check_srm,
    compute_metric_lift,
    load_csv_text,
    run_proportion_test,
    run_segment_analysis,
    run_t_test,
)
from app.telemetry import new_query_id


TASK_TYPES = {
    "launch_decision",
    "validity_debugging",
    "guardrail_regression",
    "segment_investigation",
    "srm_failure",
    "recommendation_ranking",
    "ads_experiment",
    "quasi_experiment",
    "csv_quant_analysis",
    "general_experiment_question",
}

REQUIRED_TOOLS = {
    "retrieve_playbook_rules",
    "run_data_validation",
    "check_srm",
    "compute_metric_lift",
    "run_significance_tests",
    "run_segment_analysis",
    "check_policy_constraints",
}

ALLOWED_DECISIONS = [
    "launch",
    "do_not_launch",
    "investigate_further",
    "partial_rollout",
    "do_not_trust_result",
    "use_did_or_quasi_experiment",
]


@dataclass(frozen=True)
class GraphDependencies:
    retrieve_fn: Callable[[str], list[dict[str, Any]]]
    generate_llm_answer_fn: Callable[..., str]
    validate_decision_fn: Callable[[str, str, dict[str, Any] | None], dict[str, Any]]
    evaluate_trace_fn: Callable[..., dict[str, Any]]
    extract_decision_fn: Callable[[str], str]
    apply_policy_validation_to_answer_fn: Callable[[str, dict[str, Any]], str]
    primary_llm_config_fn: Callable[[], Any]
    fallback_llm_config_fn: Callable[[], Any]
    concept_judge_callback_fn: Callable[[], Callable[[str, list[str]], list[dict[str, Any]]]]


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _contains_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _append_trace(
    state: ExperimentGraphState,
    step: str,
    status: str = "completed",
    details: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    trace = list(state.get("trace_steps", []))
    trace.append({"step": step, "status": status, "details": details or {}})
    return trace


def _replace_decision_section(answer: str, final_decision: str) -> str:
    pattern = r"(##\s*Decision Recommendation\s*\n)(.*?)(?=\n##\s+|\Z)"
    replacement = rf"\1`{final_decision}`\n"
    updated, count = re.subn(pattern, replacement, answer, count=1, flags=re.IGNORECASE | re.DOTALL)
    if count:
        return updated
    return answer.rstrip() + f"\n\n## Decision Recommendation\n`{final_decision}`\n"


def _deterministic_memo(
    question: str,
    decision_json: dict[str, Any],
    evidence_bundle: dict[str, Any],
    retrieved_chunks: list[dict[str, Any]],
) -> str:
    decision = decision_json["decision"]
    sources = "\n".join(
        f"- {source}"
        for source in dict.fromkeys(item.get("source", "unknown") for item in retrieved_chunks)
    )
    supporting = "\n".join(f"- {item}" for item in decision_json.get("supporting_evidence", [])[:5]) or "- Evidence bundle assembled."
    next_steps = "\n".join(
        f"{idx}. {item}" for idx, item in enumerate(decision_json.get("required_next_steps", []), start=1)
    ) or "1. Gather missing evidence."
    risks = "\n".join(f"- {item}" for item in decision_json.get("blocking_risks", [])[:5]) or "- Evidence may be incomplete."
    metrics = evidence_bundle.get("guardrail_flags", []) + evidence_bundle.get("validity_flags", [])
    metrics_lines = "\n".join(f"- {item}" for item in metrics[:6]) or "- primary metric lift\n- statistical significance"
    return f"""## Short Answer
{decision_json.get('primary_reason', 'Review the evidence bundle before launch.')}

## Decision Recommendation
`{decision}`

## Reasoning
{supporting}

## Metrics to Check
{metrics_lines}

## Suggested Next Steps
{next_steps}

## Risks / Caveats
{risks}

## Retrieved Sources
{sources}
"""


def _policy_reason(policy_validation: dict[str, Any], final_decision: str) -> str | None:
    for finding in policy_validation.get("policy_findings", []):
        if finding.get("recommended_decision") == final_decision:
            return str(finding.get("reason", "")).strip() or None
    return None


def _required_next_steps_for_decision(decision: str) -> list[str]:
    if decision == "do_not_trust_result":
        return [
            "Investigate assignment, exposure logging, and eligibility filters.",
            "Re-run the experiment after fixing validity issues.",
        ]
    if decision == "use_did_or_quasi_experiment":
        return [
            "Define an appropriate quasi-experimental design.",
            "Check pre-trends before making causal claims.",
        ]
    if decision == "partial_rollout":
        return [
            "Isolate the harmed segment and inspect segment-specific evidence.",
            "Consider a constrained rollout where harm is not present.",
        ]
    if decision == "launch":
        return [
            "Confirm monitoring and rollback conditions.",
            "Track guardrails after rollout.",
        ]
    return [
        "Review guardrails, segment effects, and statistical reliability.",
        "Collect missing evidence before deciding on full launch.",
    ]


def _decision_reason(decision: str) -> str:
    if decision == "do_not_trust_result":
        return "Sample ratio mismatch or experiment validity failure makes the measured lift unreliable."
    if decision == "use_did_or_quasi_experiment":
        return "The rollout is not randomized, so simple A/B causal claims should be avoided."
    if decision == "partial_rollout":
        return "An important segment may be harmed even if the aggregate result looks positive."
    if decision == "do_not_launch":
        return "The evidence indicates material product or business harm that should block launch."
    if decision == "launch":
        return "The available evidence supports launch, with normal monitoring and rollback readiness."
    return "The evidence is not strong enough for an unqualified launch recommendation."


def _tool_clean_win(tool_summary: dict[str, Any] | None) -> bool:
    if not tool_summary:
        return False
    if tool_summary.get("validation", {}).get("valid") is not True:
        return False
    srm = tool_summary.get("srm")
    if not isinstance(srm, dict) or srm.get("classification") != "pass":
        return False
    metric_lifts = [item for item in tool_summary.get("metric_lifts", []) if isinstance(item, dict)]
    by_metric = {item.get("metric"): item for item in metric_lifts}
    tests = [item for item in tool_summary.get("tests", []) if isinstance(item, dict)]
    tests_by_metric = {item.get("metric"): item for item in tests}
    required_metrics = {"revenue", "converted", "retained_7d", "complained"}
    if not required_metrics.issubset(by_metric):
        return False
    revenue = by_metric.get("revenue", {})
    revenue_test = tests_by_metric.get("revenue", {})
    revenue_lift = revenue.get("absolute_lift")
    revenue_ci_lower = revenue.get("ci_lower")
    revenue_p_value = revenue_test.get("p_value")
    if not isinstance(revenue_lift, (int, float)) or revenue_lift <= 0:
        return False
    if not isinstance(revenue_ci_lower, (int, float)) or revenue_ci_lower <= 0:
        return False
    if not isinstance(revenue_p_value, (int, float)) or float(revenue_p_value) >= 0.05:
        return False
    if by_metric.get("converted", {}).get("risk_flag") is True:
        return False
    guardrail_risk = any(
        item.get("metric") in {"retained_7d", "complained", "reported", "hidden"} and item.get("risk_flag")
        for item in metric_lifts
    )
    segments = [item for item in tool_summary.get("segments", []) if isinstance(item, dict)]
    segment_risk = any(item.get("risk_flag") for item in segments)
    validation_columns = set(tool_summary.get("validation", {}).get("columns", []))
    segment_coverage = "segment" not in validation_columns or bool(segments)
    return not guardrail_risk and not segment_risk and segment_coverage


def _build_selected_metrics(metrics: dict[str, list[str]]) -> list[str]:
    return [
        metric
        for metric in ["revenue", "clicked", "converted", "retained_7d", "complained"]
        if metric in metrics.get("numeric", []) or metric in metrics.get("binary", [])
    ]


class GraphNodes:
    def __init__(self, deps: GraphDependencies) -> None:
        self.deps = deps

    def intake_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        question = str(state.get("question", "")).strip()
        next_state: ExperimentGraphState = {
            **state,
            "query_id": state.get("query_id") or new_query_id(),
            "question": question,
            "retry_count": int(state.get("retry_count", 0)),
            "max_retries": int(state.get("max_retries", 1)),
            "errors": list(state.get("errors", [])),
            "required_tools": list(state.get("required_tools", [])),
            "tool_results": dict(state.get("tool_results", {})),
            "retrieved_chunks": list(state.get("retrieved_chunks", [])),
            "generator_backend": state.get("generator_backend") or settings.generator_backend,
            "model": state.get("model") or settings.llm_model,
            "_started_at": state.get("_started_at") or time.perf_counter(),
            "_retrieval_query": state.get("_retrieval_query"),
        }
        next_state["trace_steps"] = _append_trace(
            next_state,
            "intake",
            details={
                "has_csv": bool(state.get("csv_text")),
                "selected_corpus_ids": state.get("selected_corpus_ids", []),
            },
        )
        return next_state

    def classify_task_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        text = _normalize_text(state["question"])
        csv_text = state.get("csv_text")
        if _contains_any(text, ["sample ratio mismatch", "srm failed", "srm fail", "70/30", "30% more users"]):
            task_type = "srm_failure"
        elif _contains_any(
            text,
            ["non-random", "not randomized", "one city", "one market", "pre/post", "difference-in-differences", "quasi-experimental", "operations chose"],
        ):
            task_type = "quasi_experiment"
        elif _contains_any(text, ["retention dropped", "retention drop", "complaints increased", "guardrail regression"]):
            task_type = "guardrail_regression"
        elif _contains_any(text, ["segment harm", "high-value", "power users", "android users", "germany", "segment"]):
            task_type = "segment_investigation"
        elif _contains_any(text, ["recommendation", "ranking", "feed", "search"]):
            task_type = "recommendation_ranking"
        elif _contains_any(text, ["ads experiment", "advertiser", "roas", "ad load", "ads "]):
            task_type = "ads_experiment"
        elif csv_text:
            task_type = "csv_quant_analysis"
        elif _contains_any(text, ["logging failure", "missing exposure", "assignment changed", "eligibility drift", "validity"]):
            task_type = "validity_debugging"
        elif _contains_any(text, ["should we launch", "launch decision", "fully launch", "roll out"]):
            task_type = "launch_decision"
        else:
            task_type = "general_experiment_question"
        return {
            **state,
            "task_type": task_type,
            "trace_steps": _append_trace(
                state,
                "task_router",
                details={"task_type": task_type, "has_csv": bool(csv_text)},
            ),
        }

    def tool_planner_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        task_type = state.get("task_type") or "general_experiment_question"
        csv_text = state.get("csv_text")
        required_tools = ["retrieve_playbook_rules"]

        if csv_text or state.get("tool_summary"):
            required_tools.extend(
                [
                    "run_data_validation",
                    "check_srm",
                    "compute_metric_lift",
                    "run_significance_tests",
                ]
            )
            if task_type in {
                "segment_investigation",
                "recommendation_ranking",
                "guardrail_regression",
                "csv_quant_analysis",
            }:
                required_tools.append("run_segment_analysis")

        if task_type in {
            "guardrail_regression",
            "quasi_experiment",
            "srm_failure",
            "launch_decision",
            "recommendation_ranking",
            "ads_experiment",
            "general_experiment_question",
            "validity_debugging",
        }:
            required_tools.append("check_policy_constraints")

        required_tools = _dedupe(required_tools)
        agent_plan = {
            "planner_backend": "bounded_rules_v1",
            "task_type": task_type,
            "requires_csv_analysis": bool(csv_text or state.get("tool_summary")),
            "selected_corpus_ids": state.get("selected_corpus_ids", []),
            "selected_sources": state.get("selected_sources", []),
            "planned_tools": required_tools,
            "retrieval_strategy": "corpus-scoped hybrid BM25 + hashed vector retrieval",
            "evidence_retry_policy": "If retrieved evidence is empty or weak, broaden the retrieval query once before generation.",
            "decision_policy": "LLM writes the memo, while deterministic policy constraints can confirm or override unsafe launch labels.",
        }
        return {
            **state,
            "agent_plan": agent_plan,
            "required_tools": required_tools,
            "trace_steps": _append_trace(state, "agent_planner", details=agent_plan),
        }

    def tool_executor_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        required_tools = state.get("required_tools", [])
        tool_results = dict(state.get("tool_results", {}))

        if state.get("tool_summary") is not None:
            tool_results["tools_used"] = [tool for tool in required_tools if tool != "retrieve_playbook_rules"]
            return {
                **state,
                "tool_results": tool_results,
                "trace_steps": _append_trace(
                    state,
                    "tool_executor",
                    details={"mode": "provided_summary", "tools_used": tool_results["tools_used"]},
                ),
            }

        csv_text = state.get("csv_text")
        if not csv_text:
            return {
                **state,
                "tool_results": tool_results,
                "trace_steps": _append_trace(state, "tool_executor", details={"mode": "no_csv", "tools_used": []}),
            }

        rows = load_csv_text(csv_text)
        validation = validate_experiment_rows(rows)
        metrics = infer_metric_columns(rows)
        selected_metrics = _build_selected_metrics(metrics)

        summary: dict[str, Any] = {
            "validation": validation,
            "metrics": metrics,
            "srm": None,
            "metric_lifts": [],
            "tests": [],
            "segments": [],
        }

        if validation["valid"]:
            if "check_srm" in required_tools:
                summary["srm"] = check_srm(rows)
                tool_results["check_srm"] = summary["srm"]
            if "compute_metric_lift" in required_tools:
                summary["metric_lifts"] = [compute_metric_lift(rows, metric) for metric in selected_metrics]
                tool_results["compute_metric_lift"] = summary["metric_lifts"]
            if "run_significance_tests" in required_tools:
                tests: list[dict[str, Any]] = []
                for metric in selected_metrics:
                    if metric in metrics.get("binary", []):
                        tests.append(run_proportion_test(rows, metric))
                    else:
                        tests.append(run_t_test(rows, metric))
                summary["tests"] = tests
                tool_results["run_significance_tests"] = tests
            if "run_segment_analysis" in required_tools and "segment" in validation.get("columns", []):
                segments: list[dict[str, Any]] = []
                for metric in selected_metrics:
                    segments.extend(run_segment_analysis(rows, metric))
                summary["segments"] = segments
                tool_results["run_segment_analysis"] = segments

        tool_results["run_data_validation"] = validation
        tool_results["tools_used"] = [tool for tool in required_tools if tool != "retrieve_playbook_rules"]
        return {
            **state,
            "tool_results": tool_results,
            "tool_summary": summary,
            "trace_steps": _append_trace(
                state,
                "tool_executor",
                details={
                    "mode": "csv",
                    "tools_used": tool_results["tools_used"],
                    "valid_csv": validation.get("valid"),
                    "row_count": validation.get("row_count"),
                },
            ),
        }

    def retrieval_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        task_type = state.get("task_type")
        retrieval_query = state.get("_retrieval_query") or state["question"]
        expansions = {
            "srm_failure": "sample ratio mismatch randomization logging validity",
            "quasi_experiment": "difference-in-differences quasi experiment non-random rollout",
            "segment_investigation": "segment analysis partial rollout important segment harm",
            "guardrail_regression": "guardrail metrics retention complaints launch decision",
            "recommendation_ranking": "recommendation experiments ranking retention ctr conversion",
            "ads_experiment": "ads experiments advertiser value roas quality",
            "validity_debugging": "experiment validity assignment exposure logging eligibility drift",
        }
        if task_type in expansions:
            retrieval_query = f"{retrieval_query} {expansions[task_type]}"
        retrieved = self.deps.retrieve_fn(retrieval_query)
        top_sources = [item.get("source", "unknown") for item in retrieved[:5]]
        return {
            **state,
            "retrieved_chunks": retrieved,
            "_retrieval_query": retrieval_query,
            "trace_steps": _append_trace(
                state,
                "retrieval",
                details={
                    "query": retrieval_query,
                    "selected_sources": state.get("selected_sources", []),
                    "retrieved_chunk_count": len(retrieved),
                    "top_sources": top_sources,
                },
            ),
        }

    def evidence_bundle_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        tool_summary = state.get("tool_summary") or {}
        question_text = _normalize_text(state["question"])
        validity_flags: list[str] = []
        guardrail_flags: list[str] = []
        segment_flags: list[str] = []
        missing_information: list[str] = []

        if tool_summary.get("validation", {}).get("valid") is False:
            validity_flags.extend(tool_summary["validation"].get("errors", []))
        srm = tool_summary.get("srm")
        if isinstance(srm, dict) and srm.get("classification") == "fail":
            validity_flags.append("sample_ratio_mismatch_failed")
        if state.get("task_type") == "quasi_experiment":
            validity_flags.append("non_random_rollout_detected")

        for item in tool_summary.get("metric_lifts", []):
            metric = item.get("metric")
            if metric in {"retained_7d", "complained", "reported", "hidden"} and item.get("risk_flag"):
                guardrail_flags.append(f"{metric}_risk_flag")

        if _contains_any(question_text, ["retention dropped", "retention drop", "complaints increased", "complaints worsened"]):
            guardrail_flags.append("question_implies_guardrail_harm")

        for item in tool_summary.get("segments", []):
            if item.get("risk_flag"):
                segment_flags.append(f"segment:{item.get('segment')}")

        if _contains_any(question_text, ["segment harm", "high-value", "power users", "android users", "germany"]):
            segment_flags.append("question_implies_segment_harm")

        if not state.get("retrieved_chunks"):
            missing_information.append("no_retrieved_playbook_rules")
        if state.get("csv_text") and not tool_summary:
            missing_information.append("csv_present_but_no_tool_summary")

        evidence_bundle = {
            "question": state["question"],
            "task_type": state.get("task_type"),
            "retrieved_chunks": state.get("retrieved_chunks", []),
            "tool_summary": tool_summary,
            "validity_flags": _dedupe(validity_flags),
            "guardrail_flags": _dedupe(guardrail_flags),
            "segment_flags": _dedupe(segment_flags),
            "missing_information": _dedupe(missing_information),
        }
        return {
            **state,
            "evidence_bundle": evidence_bundle,
            "trace_steps": _append_trace(
                state,
                "evidence_bundle",
                details={
                    "validity_flags": evidence_bundle["validity_flags"],
                    "guardrail_flags": evidence_bundle["guardrail_flags"],
                    "segment_flags": evidence_bundle["segment_flags"],
                    "missing_information": evidence_bundle["missing_information"],
                },
            ),
        }

    def evidence_checker_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        evidence_bundle = state.get("evidence_bundle") or {}
        validity_flags = set(evidence_bundle.get("validity_flags", []))
        hard_validity_flags = validity_flags - {"non_random_rollout_detected"}
        missing_information = set(evidence_bundle.get("missing_information", []))
        guardrail_flags = set(evidence_bundle.get("guardrail_flags", []))
        retrieved_chunks = state.get("retrieved_chunks", [])
        top_score = float(retrieved_chunks[0].get("score", 0.0)) if retrieved_chunks else 0.0
        selected_sources = state.get("selected_sources", [])
        reasons: list[str] = []

        if hard_validity_flags:
            sufficiency = "sufficient"
            reasons.append("data or experiment validity failure is sufficient to block trusting the result")
        elif "non_random_rollout_detected" in validity_flags:
            sufficiency = "sufficient"
            reasons.append("non-random rollout is sufficient to require quasi-experimental analysis")
        elif "no_retrieved_playbook_rules" in missing_information:
            sufficiency = "insufficient"
            reasons.append("no playbook chunks were retrieved")
        elif state.get("csv_text") and not state.get("tool_summary"):
            sufficiency = "insufficient"
            reasons.append("CSV was provided but no tool summary was produced")
        elif guardrail_flags:
            sufficiency = "sufficient"
            reasons.append("guardrail risk evidence is present")
        elif selected_sources and not retrieved_chunks:
            sufficiency = "insufficient"
            reasons.append("selected corpus filter returned no chunks")
        elif retrieved_chunks and top_score < 0.15:
            sufficiency = "insufficient"
            reasons.append("top retrieval score is low")
        else:
            sufficiency = "sufficient" if state.get("retrieved_chunks") else "insufficient"
            reasons.append("retrieved chunks available" if retrieved_chunks else "no retrieved chunks available")
        evidence_check = {
            "status": sufficiency,
            "reasons": reasons,
            "top_score": round(top_score, 6),
            "retrieved_chunk_count": len(retrieved_chunks),
            "selected_sources": selected_sources,
            "retry_count": state.get("retry_count", 0),
        }
        return {
            **state,
            "evidence_sufficiency": sufficiency,
            "evidence_check": evidence_check,
            "trace_steps": _append_trace(state, "evidence_checker", status=sufficiency, details=evidence_check),
        }

    def replan_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        retry_count = int(state.get("retry_count", 0)) + 1
        required_tools = list(state.get("required_tools", []))
        if "retrieve_playbook_rules" not in required_tools:
            required_tools.append("retrieve_playbook_rules")
        fallback_query = f"{state['question']} experiment launch decision guardrails validity segment analysis"
        return {
            **state,
            "retry_count": retry_count,
            "required_tools": _dedupe(required_tools),
            "_retrieval_query": fallback_query,
            "trace_steps": _append_trace(
                state,
                "evidence_retry",
                status="retry",
                details={"retry_count": retry_count, "fallback_query": fallback_query},
            ),
        }

    def decision_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        evidence_bundle = state.get("evidence_bundle") or {}
        tool_summary = state.get("tool_summary") or {}
        validity_flags = evidence_bundle.get("validity_flags", [])
        guardrail_flags = evidence_bundle.get("guardrail_flags", [])
        segment_flags = evidence_bundle.get("segment_flags", [])
        question_text = _normalize_text(state["question"])

        hard_validity_flags = [flag for flag in validity_flags if flag != "non_random_rollout_detected"]

        if hard_validity_flags:
            decision = "do_not_trust_result"
            confidence = 0.98
            primary_reason = _decision_reason(decision)
        elif "non_random_rollout_detected" in validity_flags:
            decision = "use_did_or_quasi_experiment"
            confidence = 0.97
            primary_reason = _decision_reason(decision)
        elif segment_flags:
            decision = "partial_rollout"
            confidence = 0.82
            primary_reason = _decision_reason(decision)
        elif guardrail_flags:
            decision = "investigate_further"
            confidence = 0.86
            primary_reason = "A guardrail appears at risk, so a full launch should be blocked until the harm is understood."
        elif _tool_clean_win(tool_summary):
            decision = "launch"
            confidence = 0.86
            primary_reason = "Tool diagnostics show a clean win: validity checks pass, revenue improves, and tracked guardrails do not show risk flags."
        elif _contains_any(
            question_text,
            [
                "clean win",
                "all guardrails stable",
                "retention stable",
                "complaints stable",
                "no guardrail regression",
                "srm passed",
            ],
        ):
            decision = "launch"
            confidence = 0.74
            primary_reason = "The available evidence suggests a clean win with no obvious validity or guardrail blockers."
        else:
            decision = "investigate_further"
            confidence = 0.65
            primary_reason = "The evidence is not strong enough for an unqualified launch recommendation."

        supporting_evidence = validity_flags + guardrail_flags + segment_flags
        supporting_evidence.extend(
            [item.get("source", "unknown") for item in state.get("retrieved_chunks", [])[:3]]
        )
        blocking_risks = validity_flags + guardrail_flags + segment_flags
        required_next_steps = _required_next_steps_for_decision(decision)

        decision_json = {
            "decision": decision,
            "confidence": confidence,
            "primary_reason": primary_reason,
            "supporting_evidence": _dedupe([item for item in supporting_evidence if item]),
            "blocking_risks": _dedupe([item for item in blocking_risks if item]),
            "required_next_steps": required_next_steps,
        }
        return {
            **state,
            "decision_json": decision_json,
            "final_decision": decision,
            "trace_steps": _append_trace(
                state,
                "decision_draft",
                details={"decision": decision, "confidence": confidence, "primary_reason": primary_reason},
            ),
        }

    def policy_validator_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        decision_json = state.get("decision_json") or {}
        llm_decision = str(decision_json.get("decision", "unknown"))
        policy_validation = self.deps.validate_decision_fn(
            state["question"],
            llm_decision,
            tool_summary=state.get("tool_summary"),
        )
        return {
            **state,
            "policy_validation": policy_validation,
            "policy_decision": policy_validation.get("policy_decision"),
            "final_decision": policy_validation.get("final_decision", llm_decision),
            "trace_steps": _append_trace(
                state,
                "policy_validator",
                details={
                    "policy_action": policy_validation.get("policy_action"),
                    "policy_override": policy_validation.get("policy_override"),
                    "final_decision": policy_validation.get("final_decision", llm_decision),
                },
            ),
        }

    def revise_decision_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        decision_json = dict(state.get("decision_json") or {})
        policy_validation = state.get("policy_validation") or {}
        revised_decision = str(policy_validation.get("final_decision", decision_json.get("decision", "unknown")))
        decision_json["decision"] = revised_decision
        decision_json["primary_reason"] = _policy_reason(policy_validation, revised_decision) or _decision_reason(revised_decision)
        decision_json["required_next_steps"] = _required_next_steps_for_decision(revised_decision)
        supporting = list(decision_json.get("supporting_evidence", []))
        for finding in policy_validation.get("policy_findings", [])[:3]:
            supporting.append(f"{finding['policy_id']}->{finding['recommended_decision']}")
        decision_json["supporting_evidence"] = _dedupe(supporting)
        return {
            **state,
            "decision_json": decision_json,
            "retry_count": int(state.get("retry_count", 0)) + 1,
            "final_decision": revised_decision,
            "trace_steps": _append_trace(
                state,
                "decision_revision",
                status="policy_override",
                details={"revised_decision": revised_decision},
            ),
        }

    def memo_generator_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        decision_json = state.get("decision_json") or {}
        final_decision = str(decision_json.get("decision", "investigate_further"))
        generator_backend = state.get("generator_backend") or settings.generator_backend
        model_name = state.get("model") or settings.llm_model
        generator_error = None
        fallback_error = None
        llm_answer = None
        llm_decision = None

        if generator_backend in {"openai_compatible", "local_llm", "llm"}:
            try:
                llm_answer = self.deps.generate_llm_answer_fn(
                    state["question"],
                    state.get("retrieved_chunks", []),
                    self.deps.primary_llm_config_fn(),
                    tool_summary=state.get("tool_summary"),
                    allowed_decisions=[final_decision],
                )
            except LLMGenerationError as exc:
                if not settings.llm_fallback_enabled:
                    raise
                generator_error = str(exc)
                try:
                    llm_answer = self.deps.generate_llm_answer_fn(
                        state["question"],
                        state.get("retrieved_chunks", []),
                        self.deps.fallback_llm_config_fn(),
                        tool_summary=state.get("tool_summary"),
                        allowed_decisions=[final_decision],
                    )
                    generator_backend = "local_llm_fallback"
                    model_name = settings.fallback_llm_model
                except LLMGenerationError as fallback_exc:
                    fallback_error = str(fallback_exc)
                    generator_backend = "rule_fallback"
                    llm_answer = _deterministic_memo(
                        state["question"],
                        decision_json,
                        state.get("evidence_bundle") or {},
                        state.get("retrieved_chunks", []),
                    )
                    model_name = getattr(settings, "model_name", "local-rule-generator")
            llm_decision = self.deps.extract_decision_fn(llm_answer)
            memo_policy_validation = self.deps.validate_decision_fn(
                state["question"],
                llm_decision or final_decision,
                tool_summary=state.get("tool_summary"),
            )
            if memo_policy_validation.get("policy_override"):
                state = {
                    **state,
                    "llm_answer_before_policy": llm_answer,
                }
                final_decision = str(memo_policy_validation.get("final_decision", final_decision))
                decision_json["decision"] = final_decision
            state = {
                **state,
                "policy_validation": memo_policy_validation,
                "policy_decision": memo_policy_validation.get("policy_decision"),
                "final_decision": final_decision,
            }
            answer = _replace_decision_section(llm_answer, final_decision)
        else:
            generator_backend = "rule"
            model_name = getattr(settings, "model_name", "local-rule-generator")
            llm_answer = _deterministic_memo(
                state["question"],
                decision_json,
                state.get("evidence_bundle") or {},
                state.get("retrieved_chunks", []),
            )
            llm_decision = final_decision
            answer = llm_answer

        answer = self.deps.apply_policy_validation_to_answer_fn(answer, state.get("policy_validation") or {})

        next_state: ExperimentGraphState = {
            **state,
            "answer": answer,
            "llm_decision": llm_decision,
            "final_decision": final_decision,
            "decision_json": decision_json,
            "generator_backend": generator_backend,
            "model": model_name,
        }
        if generator_error:
            next_state["errors"] = list(state.get("errors", [])) + [generator_error]
            next_state["generator_error"] = generator_error
        if fallback_error:
            next_state["fallback_error"] = fallback_error
        return next_state

    def eval_node(self, state: ExperimentGraphState) -> ExperimentGraphState:
        decision_json = state.get("decision_json") or {}
        final_decision = str(decision_json.get("decision", state.get("final_decision", "unknown")))
        retrieved_sources = [item["source"] for item in state.get("retrieved_chunks", [])]
        concept_judge = None
        if settings.concept_judge_enabled and state.get("expected_concepts"):
            concept_judge = self.deps.concept_judge_callback_fn()

        evaluation = self.deps.evaluate_trace_fn(
            state.get("answer", ""),
            retrieved_sources,
            final_decision,
            expected_sources=state.get("expected_sources", []),
            expected_concepts=state.get("expected_concepts", []),
            expected_decision=state.get("expected_decision"),
            llm_decision=state.get("llm_decision"),
            policy_decision=state.get("policy_decision"),
            policy_validation=state.get("policy_validation"),
            concept_judge=concept_judge,
            concept_coverage_target=settings.concept_coverage_failure_threshold,
        )
        evaluation.update(
            {
                "task_type": state.get("task_type"),
                "required_tools": state.get("required_tools", []),
                "tools_used": state.get("tool_results", {}).get("tools_used", []),
                "evidence_sufficient": state.get("evidence_sufficiency") == "sufficient",
                "decision_json_valid": all(
                    key in decision_json
                    for key in ["decision", "confidence", "primary_reason", "supporting_evidence", "blocking_risks", "required_next_steps"]
                ),
                "memo_decision_consistent": self.deps.extract_decision_fn(state.get("answer", "")) == final_decision,
                "policy_override": bool((state.get("policy_validation") or {}).get("policy_override")),
            }
        )
        latency = round(time.perf_counter() - float(state.get("_started_at", time.perf_counter())), 4)
        return {**state, "evaluation": evaluation, "latency_seconds": latency}
