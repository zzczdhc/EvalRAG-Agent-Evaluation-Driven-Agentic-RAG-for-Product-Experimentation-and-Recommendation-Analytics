"""Policy validation for hybrid experiment launch decisions."""

from __future__ import annotations

import re
from typing import Any


DECISION_PRIORITIES = {
    "do_not_trust_result": 100,
    "use_did_or_quasi_experiment": 90,
    "partial_rollout": 80,
    "investigate_further": 70,
    "do_not_launch": 60,
    "launch": 10,
}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _contains_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def _finding(
    policy_id: str,
    recommended_decision: str,
    reason: str,
    evidence: str,
    priority: int,
    severity: str = "blocking",
) -> dict[str, Any]:
    return {
        "policy_id": policy_id,
        "recommended_decision": recommended_decision,
        "reason": reason,
        "evidence": evidence,
        "priority": priority,
        "severity": severity,
    }


def _tool_srm_failed(tool_summary: dict[str, Any] | None) -> bool:
    if not tool_summary:
        return False
    return tool_summary.get("srm", {}).get("classification") == "fail"


def _tool_guardrail_flags(tool_summary: dict[str, Any] | None) -> list[str]:
    if not tool_summary:
        return []
    flagged: list[str] = []
    for item in tool_summary.get("metric_lifts", []):
        metric = item.get("metric")
        if metric in {"retained_7d", "complained", "reported", "hidden"} and item.get("risk_flag"):
            flagged.append(str(metric))
    return flagged


def _tool_clean_win(tool_summary: dict[str, Any] | None) -> bool:
    if not tool_summary:
        return False
    validation_valid = tool_summary.get("validation", {}).get("valid") is True
    srm_passed = tool_summary.get("srm", {}).get("classification") == "pass"
    metric_lifts = tool_summary.get("metric_lifts", [])
    lift_by_metric = {item.get("metric"): item for item in metric_lifts if isinstance(item, dict)}
    revenue_win = lift_by_metric.get("revenue", {}).get("absolute_lift", 0) > 0
    conversion_not_harmed = lift_by_metric.get("converted", {}).get("risk_flag") is not True
    guardrails_stable = not _tool_guardrail_flags(tool_summary)
    segment_risk = any(item.get("risk_flag") for item in tool_summary.get("segments", []) if isinstance(item, dict))
    return bool(validation_valid and srm_passed and revenue_win and conversion_not_harmed and guardrails_stable and not segment_risk)


def validate_decision(
    question: str,
    llm_decision: str,
    tool_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate an LLM decision against hard experimentation policies.

    The validator is not a memo generator and does not replace the LLM. It only
    applies high-confidence product experimentation constraints that should be
    auditable in logs and eval records.
    """

    text = normalize_text(question)
    findings: list[dict[str, Any]] = []

    if _tool_srm_failed(tool_summary) or _contains_any(
        text,
        [
            "sample ratio mismatch",
            "srm failed",
            "srm fail",
            "srm at p",
            "70/30",
            "70 30",
            "30% more users",
            "exposure logs are missing",
            "missing exposure",
            "assignment changed",
            "assignment bug",
            "eligible users than expected",
            "population drifted",
            "logging failure",
            "logging issue",
            "randomization issue",
        ],
    ):
        findings.append(
            _finding(
                "experiment_validity_blocks_launch",
                "do_not_trust_result",
                "Experiment assignment, sample ratio, eligibility, or logging validity is suspect, so metric lift should not be trusted as causal launch evidence.",
                "question_or_tool_summary",
                DECISION_PRIORITIES["do_not_trust_result"],
            )
        )

    if _contains_any(
        text,
        [
            "non-random",
            "non random",
            "not randomized",
            "no randomized control",
            "one city",
            "one market",
            "one country",
            "pre/post",
            "pre post",
            "difference-in-differences",
            "difference in differences",
            "quasi-experimental",
            "policy changed",
            "comparison group",
            "operations chose",
        ],
    ):
        findings.append(
            _finding(
                "non_random_rollout_requires_quasi_experiment",
                "use_did_or_quasi_experiment",
                "The rollout is not a clean randomized A/B test, so the decision should not rely on simple treatment/control or before/after causal claims.",
                "question_text",
                DECISION_PRIORITIES["use_did_or_quasi_experiment"],
            )
        )

    segment_terms = [
        "high-value",
        "power users",
        "returning high-value",
        "android users",
        "germany",
        "new users improved",
        "negative for returning",
    ]
    harm_terms = ["harmed", "harm", "hurt", "negative", "lower", "fell", "dropped", "worse", "complaints", "large negative"]
    if _contains_any(text, segment_terms) and _contains_any(text, harm_terms):
        findings.append(
            _finding(
                "important_segment_harm_blocks_full_launch",
                "partial_rollout",
                "An overall win may hide harm to an important segment, so full launch should be blocked until segment risk is isolated or mitigated.",
                "question_text",
                DECISION_PRIORITIES["partial_rollout"],
            )
        )

    if _contains_any(text, ["small sellers", "seller exposure", "supply health", "few sellers", "less diverse", "item exposure less diverse", "concentrating traffic"]):
        findings.append(
            _finding(
                "marketplace_health_guardrail_requires_investigation",
                "investigate_further",
                "Marketplace or supply-side health appears at risk, so the launch memo should inspect long-term marketplace effects before full rollout.",
                "question_text",
                DECISION_PRIORITIES["investigate_further"],
            )
        )

    guardrail_metrics = _tool_guardrail_flags(tool_summary)
    retention_harm = "retention" in text and _contains_any(text, ["drop", "dropped", "down", "decrease", "decreased", "declined", "lower", "worse", "hurt"])
    complaint_harm = _contains_any(
        text,
        [
            "complaint rate increased",
            "complaints increased",
            "complaints worsened",
            "report rate increased",
            "hide rate increased",
            "unsubscribe rate worsened",
            "complaints and unsubscribe rate worsened",
            "more complaints",
        ],
    )
    if guardrail_metrics or retention_harm or complaint_harm:
        evidence = f"tool_metrics={guardrail_metrics}" if guardrail_metrics else "question_text"
        findings.append(
            _finding(
                "critical_guardrail_regression_blocks_full_launch",
                "investigate_further",
                "A critical guardrail appears to worsen, so a full launch should be blocked until statistical reliability, segment concentration, and mitigation are checked.",
                evidence,
                DECISION_PRIORITIES["investigate_further"],
            )
        )

    engagement_up = _contains_any(text, ["ctr", "click", "add-to-cart", "add to cart", "engagement", "watch time"])
    downstream_quality_down = _contains_any(
        text,
        [
            "conversion rate decreased",
            "conversion decreased",
            "conversion down",
            "cvr down",
            "lowered purchase conversion",
            "purchase conversion",
            "revenue flat",
            "revenue is flat",
            "revenue down",
            "revenue decreased",
            "traffic quality",
        ],
    )
    ads_quality_down = _contains_any(text, ["ads", "ad ", "advertiser", "ad load"]) and _contains_any(
        text,
        [
            "conversion quality",
            "advertiser conversion",
            "roas",
            "return on ad spend",
            "advertiser value",
            "unsubscribe rate",
            "complaints",
        ],
    ) and _contains_any(text, ["lower", "lowered", "down", "decreased", "dropped", "worse", "worsened", "reduced"])
    if engagement_up and (downstream_quality_down or ads_quality_down):
        findings.append(
            _finding(
                "engagement_lift_with_quality_drop_requires_investigation",
                "investigate_further",
                "Engagement or CTR gains are insufficient when conversion quality, advertiser value, revenue, ROAS, or downstream user value worsens.",
                "question_text",
                DECISION_PRIORITIES["investigate_further"],
            )
        )

    if _contains_any(
        text,
        [
            "confidence interval includes meaningful downside",
            "confidence interval includes downside",
            "ci includes downside",
            "confidence interval crosses",
            "not statistically significant",
            "underpowered",
            "low power",
            "wide confidence interval",
        ],
    ):
        findings.append(
            _finding(
                "statistical_uncertainty_requires_investigation",
                "investigate_further",
                "Material uncertainty or meaningful downside in confidence intervals should block confident launch until the risk is quantified or the experiment is extended.",
                "question_text",
                DECISION_PRIORITIES["investigate_further"],
            )
        )

    if _contains_any(text, ["always acceptable", "under 3%", "fixed threshold"]) and "retention" in text:
        findings.append(
            _finding(
                "unsupported_fixed_guardrail_threshold_requires_investigation",
                "investigate_further",
                "A fixed acceptable retention-drop threshold should not be assumed unless the playbook explicitly supports it.",
                "question_text",
                DECISION_PRIORITIES["investigate_further"],
            )
        )

    if _contains_any(text, ["did not predefine", "not predefine", "no primary metric", "no guardrails", "did not define guardrails"]):
        findings.append(
            _finding(
                "missing_primary_metric_or_guardrails_requires_investigation",
                "investigate_further",
                "Launch evidence is weaker when primary metrics or guardrails were not predefined before interpreting results.",
                "question_text",
                DECISION_PRIORITIES["investigate_further"],
            )
        )

    primary_win = _tool_clean_win(tool_summary) or _contains_any(
        text,
        [
            "clean win",
            "revenue increased",
            "revenue is significantly up",
            "revenue significantly up",
            "conversion improved",
            "conversion is up",
            "primary metric improved",
            "all major metrics good",
        ],
    )
    stable_evidence_count = sum(
        1
        for term in [
            "retention stable",
            "retention is stable",
            "complaints stable",
            "complaints are stable",
            "guardrails stable",
            "all guardrails stable",
            "no guardrail regression",
            "no guardrail regressions",
            "srm passed",
            "segment checks show no harm",
            "segments show no harm",
            "no harm",
        ]
        if term in text
    )
    has_blocking_finding = any(finding["recommended_decision"] != "launch" for finding in findings)
    if primary_win and (stable_evidence_count >= 2 or _tool_clean_win(tool_summary)) and not has_blocking_finding:
        findings.append(
            _finding(
                "clean_win_supports_launch",
                "launch",
                "Primary metrics improved while key guardrails and validity checks appear stable, so launch is reasonable with monitoring.",
                "tool_summary" if _tool_clean_win(tool_summary) else "question_text",
                DECISION_PRIORITIES["launch"],
                severity="supportive",
            )
        )

    findings.sort(key=lambda item: item["priority"], reverse=True)
    policy_decision = findings[0]["recommended_decision"] if findings else None
    final_decision = policy_decision or llm_decision
    policy_triggered = bool(findings)
    policy_override = bool(policy_decision and policy_decision != llm_decision)
    if policy_override:
        policy_action = "override"
    elif policy_triggered:
        policy_action = "confirm"
    else:
        policy_action = "none"

    return {
        "llm_decision": llm_decision,
        "policy_decision": policy_decision,
        "final_decision": final_decision,
        "policy_action": policy_action,
        "policy_triggered": policy_triggered,
        "policy_override": policy_override,
        "policy_findings": findings,
    }
