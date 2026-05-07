#!/usr/bin/env python3
"""Run Ragas evaluation over saved EvalRAG records.

This script intentionally consumes records produced by scripts/run_eval.py instead
of re-running the RAG pipeline. That lets us separate generation cost from judge
cost and reuse the same answer/retrieval traces for multiple evaluators.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import warnings
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_RECORDS_PATH = ROOT / "logs" / "openai_eval_full.json"
DEFAULT_OUTPUT_PATH = ROOT / "logs" / "ragas_eval_report.json"
DEFAULT_CSV_OUTPUT_PATH = ROOT / "logs" / "ragas_eval_report.csv"

CANONICAL_METRICS = {
    "faithfulness": ["faithfulness"],
    "answer_relevancy": ["answer_relevancy", "response_relevancy"],
    "context_precision": ["context_precision", "context_precision_with_reference", "llm_context_precision_with_reference"],
    "context_recall": ["context_recall", "llm_context_recall"],
    "answer_correctness": ["answer_correctness"],
}


def load_records(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError(f"Expected {path} to contain a JSON list of eval records.")
    return data


def _reference_from_record(record: dict[str, Any]) -> str:
    explicit = record.get("ground_truth") or record.get("reference")
    if explicit:
        return str(explicit)
    expected_decision = record.get("expected_decision") or "unknown"
    concepts = record.get("expected_concepts") or []
    concept_text = ", ".join(str(concept) for concept in concepts) if concepts else "the relevant experimentation concepts"
    return (
        f"The ideal answer should recommend `{expected_decision}` and clearly explain the decision using: "
        f"{concept_text}. It should stay grounded in the retrieved playbook context."
    )


def _contexts_from_record(record: dict[str, Any], max_context_chars: int) -> list[str]:
    contexts: list[str] = []
    for chunk in record.get("retrieved_chunks", []):
        text = str(chunk.get("text") or chunk.get("text_preview") or "").strip()
        if text:
            contexts.append(text[:max_context_chars])
    return contexts


def build_ragas_rows(
    records: list[dict[str, Any]],
    max_context_chars: int = 2200,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        answer = str(record.get("answer") or "").strip()
        question = str(record.get("question") or "").strip()
        contexts = _contexts_from_record(record, max_context_chars=max_context_chars)
        if not question or not answer or not contexts:
            continue
        rows.append(
            {
                "eval_id": record.get("eval_id") or record.get("query_id") or f"row_{index + 1}",
                "category": record.get("category") or record.get("expected_decision") or "uncategorized",
                "user_input": question,
                "response": answer,
                "retrieved_contexts": contexts,
                "reference": _reference_from_record(record),
                "expected_decision": record.get("expected_decision"),
                "final_decision": record.get("final_decision") or record.get("decision"),
                "source_match_rate": record.get("evaluation", {}).get("source_match_rate"),
                "custom_failure_hypothesis": record.get("evaluation", {}).get("failure_hypothesis"),
            }
        )
    return rows


def _float_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _canonical_metric_value(row: dict[str, Any], metric: str) -> float | None:
    for name in CANONICAL_METRICS[metric]:
        if name in row:
            return _float_or_none(row.get(name))
    return None


def summarize_metric_rows(metric_rows: list[dict[str, Any]]) -> dict[str, float | None]:
    summary: dict[str, float | None] = {}
    for metric in CANONICAL_METRICS:
        values = [value for row in metric_rows if (value := _canonical_metric_value(row, metric)) is not None]
        summary[metric] = round(statistics.mean(values), 4) if values else None
    return summary


def summarize_metric_rows_by_category(metric_rows: list[dict[str, Any]]) -> dict[str, dict[str, float | None]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in metric_rows:
        category = str(row.get("category") or "uncategorized")
        grouped.setdefault(category, []).append(row)
    return {category: summarize_metric_rows(rows) for category, rows in sorted(grouped.items())}


def classify_ragas_failures(
    metric_rows: list[dict[str, Any]],
    threshold: float = 0.7,
) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    for row in metric_rows:
        weak_metrics = {
            metric: value
            for metric in CANONICAL_METRICS
            if (value := _canonical_metric_value(row, metric)) is not None and value < threshold
        }
        if not weak_metrics:
            continue
        if "context_precision" in weak_metrics or "context_recall" in weak_metrics:
            hypothesis = "retrieval_fail"
        elif "faithfulness" in weak_metrics:
            hypothesis = "hallucination_or_grounding_fail"
        elif "answer_correctness" in weak_metrics:
            hypothesis = "answer_correctness_or_reference_gap"
        else:
            hypothesis = "answer_relevance_or_reasoning_fail"
        failures.append(
            {
                "eval_id": row.get("eval_id"),
                "category": row.get("category"),
                "failure_hypothesis": hypothesis,
                "weak_metrics": weak_metrics,
                "question": row.get("user_input"),
            }
        )
    return failures


def _dataframe_records(dataframe: Any, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = dataframe.to_dict(orient="records")
    for index, record in enumerate(records):
        if index < len(rows):
            record.setdefault("eval_id", rows[index].get("eval_id"))
            record.setdefault("category", rows[index].get("category"))
            record.setdefault("user_input", rows[index].get("user_input"))
    return records


def _openai_api_key() -> str:
    return os.getenv("EVALRAG_RAGAS_API_KEY") or os.getenv("OPENAI_API_KEY") or ""


def _needs_max_completion_tokens(model: str) -> bool:
    normalized = model.lower().replace("_", "-")
    if normalized.startswith("gpt-5"):
        return True
    if len(normalized) >= 2 and normalized[0] == "o" and normalized[1].isdigit():
        return True
    return normalized == "codex-mini"


def _patch_reasoning_model_args(llm: Any, model: str, max_tokens: int) -> None:
    if not _needs_max_completion_tokens(model):
        return
    model_args = getattr(llm, "model_args", None)
    if not isinstance(model_args, dict):
        return
    token_budget = model_args.pop("max_tokens", max_tokens)
    model_args.setdefault("max_completion_tokens", token_budget)
    # Ragas 0.4.3 does not recognize dotted GPT-5 names such as gpt-5.4-mini.
    # Remove optional sampling args that some GPT-5/o-series endpoints reject.
    model_args.pop("top_p", None)


def _build_modern_ragas_components(
    model: str,
    embedding_model: str,
    max_tokens: int,
    temperature: float,
    relevancy_strictness: int,
    timeout_seconds: int,
) -> tuple[list[Any], Any, Any]:
    from langchain_openai import OpenAIEmbeddings as LangchainOpenAIEmbeddings
    from openai import OpenAI
    from ragas.embeddings.base import LangchainEmbeddingsWrapper
    from ragas.llms import llm_factory

    # Ragas 0.4.x documents the newer ragas.metrics.collections imports, but
    # evaluate() in the same release still validates against the older metric
    # base class. These class constructors produce compatible metric objects.
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="Importing .* from 'ragas.metrics' is deprecated.*",
            category=DeprecationWarning,
        )
        from ragas.metrics import answer_correctness, answer_relevancy, context_precision, context_recall, faithfulness

    api_key = _openai_api_key()
    if not api_key:
        raise RuntimeError("Set OPENAI_API_KEY or EVALRAG_RAGAS_API_KEY before running Ragas evaluation.")
    client = OpenAI(api_key=api_key, timeout=timeout_seconds)
    llm = llm_factory(model, client=client, max_tokens=max_tokens, temperature=temperature)
    _patch_reasoning_model_args(llm, model=model, max_tokens=max_tokens)
    langchain_embeddings = LangchainOpenAIEmbeddings(model=embedding_model, api_key=api_key, timeout=timeout_seconds)
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="LangchainEmbeddingsWrapper is deprecated.*",
            category=DeprecationWarning,
        )
        embeddings = LangchainEmbeddingsWrapper(langchain_embeddings)
    metrics = [
        type(faithfulness)(),
        type(answer_relevancy)(strictness=relevancy_strictness),
        type(context_precision)(),
        type(context_recall)(),
        type(answer_correctness)(),
    ]
    return metrics, llm, embeddings


def _run_modern_ragas(
    rows: list[dict[str, Any]],
    model: str,
    embedding_model: str,
    max_tokens: int,
    temperature: float,
    relevancy_strictness: int,
    timeout_seconds: int,
    max_retries: int,
    max_wait_seconds: int,
    max_workers: int,
    batch_size: int | None,
) -> tuple[list[dict[str, Any]], Any]:
    from ragas import EvaluationDataset, evaluate
    from ragas.run_config import RunConfig

    try:
        from ragas import SingleTurnSample
    except ImportError:  # pragma: no cover - version compatibility
        from ragas.dataset_schema import SingleTurnSample

    samples = [
        SingleTurnSample(
            user_input=row["user_input"],
            response=row["response"],
            retrieved_contexts=row["retrieved_contexts"],
            reference=row["reference"],
        )
        for row in rows
    ]
    dataset = EvaluationDataset(samples=samples)
    metrics, llm, embeddings = _build_modern_ragas_components(
        model=model,
        embedding_model=embedding_model,
        max_tokens=max_tokens,
        temperature=temperature,
        relevancy_strictness=relevancy_strictness,
        timeout_seconds=timeout_seconds,
    )
    run_config = RunConfig(
        timeout=timeout_seconds,
        max_retries=max_retries,
        max_wait=max_wait_seconds,
        max_workers=max_workers,
    )
    result = evaluate(
        dataset,
        metrics=metrics,
        llm=llm,
        embeddings=embeddings,
        run_config=run_config,
        batch_size=batch_size,
        raise_exceptions=False,
    )
    dataframe = result.to_pandas()
    return _dataframe_records(dataframe, rows), dataframe


def _run_legacy_ragas(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], Any]:
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import answer_correctness, answer_relevancy, context_precision, context_recall, faithfulness

    dataset = Dataset.from_list(
        [
            {
                "question": row["user_input"],
                "answer": row["response"],
                "contexts": row["retrieved_contexts"],
                "ground_truth": row["reference"],
            }
            for row in rows
        ]
    )
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall, answer_correctness],
        raise_exceptions=False,
    )
    dataframe = result.to_pandas()
    return _dataframe_records(dataframe, rows), dataframe


def run_ragas(
    rows: list[dict[str, Any]],
    model: str,
    embedding_model: str,
    max_tokens: int,
    temperature: float,
    relevancy_strictness: int,
    timeout_seconds: int,
    max_retries: int,
    max_wait_seconds: int,
    max_workers: int,
    batch_size: int | None,
) -> tuple[list[dict[str, Any]], Any]:
    try:
        return _run_modern_ragas(
            rows,
            model=model,
            embedding_model=embedding_model,
            max_tokens=max_tokens,
            temperature=temperature,
            relevancy_strictness=relevancy_strictness,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            max_wait_seconds=max_wait_seconds,
            max_workers=max_workers,
            batch_size=batch_size,
        )
    except ImportError:
        return _run_legacy_ragas(rows)


def write_report(
    output_path: Path,
    prepared_rows: list[dict[str, Any]],
    metric_rows: list[dict[str, Any]],
    threshold: float,
) -> dict[str, Any]:
    overall_metrics = summarize_metric_rows(metric_rows)
    metrics_by_category = summarize_metric_rows_by_category(metric_rows)
    report = {
        "record_count": len(prepared_rows),
        "ragas_metrics_overall": overall_metrics,
        "ragas_metrics_by_category": metrics_by_category,
        # Backward-compatible alias for existing tooling.
        "ragas_metrics": overall_metrics,
        "failure_threshold": threshold,
        "failure_analysis": classify_ragas_failures(metric_rows, threshold=threshold),
        "records": metric_rows,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--records", type=Path, default=DEFAULT_RECORDS_PATH, help="Saved records from scripts/run_eval.py --save-records.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="JSON report output path.")
    parser.add_argument("--csv-output", type=Path, default=DEFAULT_CSV_OUTPUT_PATH, help="Optional CSV output path.")
    parser.add_argument("--limit", type=int, default=None, help="Evaluate only the first N saved records.")
    parser.add_argument("--failure-threshold", type=float, default=0.7, help="Scores below this are surfaced in failure_analysis.")
    parser.add_argument("--max-context-chars", type=int, default=1600, help="Max characters kept per retrieved context.")
    parser.add_argument("--ragas-model", default=os.getenv("EVALRAG_RAGAS_MODEL", "gpt-5.4-mini"), help="OpenAI model used by Ragas judge metrics.")
    parser.add_argument("--ragas-embedding-model", default=os.getenv("EVALRAG_RAGAS_EMBEDDING_MODEL", "text-embedding-3-small"), help="OpenAI embedding model used by Ragas metrics.")
    parser.add_argument("--ragas-max-tokens", type=int, default=int(os.getenv("EVALRAG_RAGAS_MAX_TOKENS", "4096")), help="Max output tokens for Ragas judge calls.")
    parser.add_argument("--ragas-temperature", type=float, default=float(os.getenv("EVALRAG_RAGAS_TEMPERATURE", "0.0")), help="Temperature for Ragas judge calls.")
    parser.add_argument("--ragas-relevancy-strictness", type=int, default=int(os.getenv("EVALRAG_RAGAS_RELEVANCY_STRICTNESS", "1")), help="Number of generated questions used by answer_relevancy. GPT-5 judge paths are most stable with 1.")
    parser.add_argument("--ragas-timeout-seconds", type=int, default=int(os.getenv("EVALRAG_RAGAS_TIMEOUT_SECONDS", "300")), help="Per-job timeout for Ragas judge calls.")
    parser.add_argument("--ragas-max-retries", type=int, default=int(os.getenv("EVALRAG_RAGAS_MAX_RETRIES", "2")), help="Retry count for Ragas judge calls.")
    parser.add_argument("--ragas-max-wait-seconds", type=int, default=int(os.getenv("EVALRAG_RAGAS_MAX_WAIT_SECONDS", "20")), help="Maximum retry backoff wait for Ragas judge calls.")
    parser.add_argument("--ragas-max-workers", type=int, default=int(os.getenv("EVALRAG_RAGAS_MAX_WORKERS", "2")), help="Maximum concurrent Ragas judge jobs. Lower values reduce timeout/rate-limit pressure.")
    parser.add_argument("--ragas-batch-size", type=int, default=int(os.getenv("EVALRAG_RAGAS_BATCH_SIZE", "4")), help="Ragas evaluation batch size. Use 0 to let Ragas choose.")
    parser.add_argument("--prepare-only", action="store_true", help="Prepare the Ragas dataset JSON without calling Ragas or an LLM judge.")
    args = parser.parse_args()

    records = load_records(args.records)
    if args.limit is not None:
        records = records[: args.limit]
    rows = build_ragas_rows(records, max_context_chars=args.max_context_chars)
    if not rows:
        raise SystemExit("No usable records found. Run scripts/run_eval.py --save-records first.")

    if args.prepare_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"record_count": len(rows), "records": rows}, indent=2), encoding="utf-8")
        print(json.dumps({"record_count": len(rows), "prepared_dataset": str(args.output)}, indent=2))
        return

    print(
        json.dumps(
            {
                "record_count": len(rows),
                "metric_count": len(CANONICAL_METRICS),
                "estimated_jobs": len(rows) * len(CANONICAL_METRICS),
                "ragas_model": args.ragas_model,
                "ragas_embedding_model": args.ragas_embedding_model,
                "timeout_seconds": args.ragas_timeout_seconds,
                "max_retries": args.ragas_max_retries,
                "max_workers": args.ragas_max_workers,
                "batch_size": args.ragas_batch_size or None,
            },
            indent=2,
        )
    )

    try:
        metric_rows, dataframe = run_ragas(
            rows,
            model=args.ragas_model,
            embedding_model=args.ragas_embedding_model,
            max_tokens=args.ragas_max_tokens,
            temperature=args.ragas_temperature,
            relevancy_strictness=args.ragas_relevancy_strictness,
            timeout_seconds=args.ragas_timeout_seconds,
            max_retries=args.ragas_max_retries,
            max_wait_seconds=args.ragas_max_wait_seconds,
            max_workers=args.ragas_max_workers,
            batch_size=args.ragas_batch_size or None,
        )
    except ImportError as exc:
        raise SystemExit(
            "Ragas is not installed. Install dependencies with `pip install -r requirements.txt`, "
            "then rerun this command."
        ) from exc
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc

    args.csv_output.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(args.csv_output, index=False)
    report = write_report(args.output, rows, metric_rows, threshold=args.failure_threshold)
    print(json.dumps({k: v for k, v in report.items() if k != "records"}, indent=2))


if __name__ == "__main__":
    main()
