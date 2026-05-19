"""Corpus metadata and source resolution for playbook-scoped retrieval."""

from __future__ import annotations


CORPUS_SOURCE_MAP: dict[str, list[str]] = {
    "product-experimentation": [
        "ab_testing.md",
        "experiment_telemetry.md",
        "launch_decision.md",
        "recommendation_experiments.md",
    ],
    "guardrails": [
        "guardrail_metrics.md",
        "marketplace_metrics.md",
        "recommendation_experiments.md",
        "ads_experiments.md",
    ],
    "srm-validity": [
        "sample_ratio_mismatch.md",
        "ab_testing.md",
        "experiment_telemetry.md",
    ],
    "launch-rubric": [
        "launch_decision.md",
        "segment_analysis.md",
        "did_policy_analysis.md",
        "guardrail_metrics.md",
    ],
}


def resolve_corpus_sources(corpus_ids: list[str] | None) -> list[str]:
    """Return source filenames allowed by selected corpus ids.

    Empty selection means no corpus filter. Unknown ids are ignored so callers can
    safely pass frontend-only placeholders while backend metadata evolves.
    """

    if not corpus_ids:
        return []
    sources: list[str] = []
    for corpus_id in corpus_ids:
        sources.extend(CORPUS_SOURCE_MAP.get(corpus_id, []))
    return list(dict.fromkeys(sources))
