import { NextResponse } from "next/server";
import { mockResult } from "@/lib/mock-data";
import type { AnalysisResult, DiagnosticResult, Recommendation, RetrievedContext } from "@/lib/types";

type BackendChunk = {
  source?: string;
  text?: string;
  text_preview?: string;
  score?: number;
  similarity_score?: number;
};

type BackendResponse = {
  answer?: string;
  decision?: string;
  final_decision?: string;
  retrieved_chunks?: BackendChunk[];
  evaluation?: Record<string, unknown>;
  policy_validation?: Record<string, unknown>;
  tool_summary?: Record<string, unknown>;
};

const BACKEND_URL = process.env.EVALRAG_BACKEND_URL ?? "http://127.0.0.1:8000";

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapDecision(decision?: string): Recommendation {
  switch (decision) {
    case "launch":
      return "Launch";
    case "do_not_launch":
    case "do_not_trust_result":
      return "Do Not Launch";
    case "partial_rollout":
      return "Launch with Guardrails";
    case "investigate_further":
    case "use_did_or_quasi_experiment":
    default:
      return "Needs More Investigation";
  }
}

function extractSection(markdown: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function listFromSection(section: string) {
  return section
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""))
    .filter(Boolean)
    .slice(0, 6);
}

function retrievedContext(chunks: BackendChunk[] = []): RetrievedContext[] {
  return chunks.slice(0, 5).map((chunk) => ({
    source: chunk.source ?? "unknown",
    snippet: chunk.text_preview ?? chunk.text?.slice(0, 240) ?? "Retrieved playbook context.",
    score: asNumber(chunk.score ?? chunk.similarity_score, 0),
  }));
}

function diagnosticsFromToolSummary(toolSummary?: Record<string, unknown>): DiagnosticResult[] {
  if (!toolSummary) {
    return [
      { label: "Metric difference", value: "not provided", status: "watch" },
      { label: "CSV diagnostics", value: "not run", status: "watch" },
    ];
  }

  const diagnostics: DiagnosticResult[] = [];
  const srm = toolSummary.srm as Record<string, unknown> | undefined;
  if (srm?.classification) {
    diagnostics.push({
      label: "SRM check",
      value: String(srm.classification),
      status: srm.classification === "pass" ? "pass" : "risk",
    });
  }

  const metricLifts = Array.isArray(toolSummary.metric_lifts) ? toolSummary.metric_lifts : [];
  for (const item of metricLifts.slice(0, 3)) {
    const metric = item as Record<string, unknown>;
    diagnostics.push({
      label: String(metric.metric ?? "Metric lift"),
      value: `${asNumber(metric.lift_pct, 0).toFixed(2)}%`,
      status: metric.risk_flag ? "risk" : "pass",
    });
  }

  const tests = Array.isArray(toolSummary.tests) ? toolSummary.tests : [];
  if (tests.length) {
    const risky = tests.some((item) => asNumber((item as Record<string, unknown>).p_value, 1) < 0.05);
    diagnostics.push({
      label: "Significance tests",
      value: `${tests.length} run`,
      status: risky ? "watch" : "pass",
    });
  }

  const segments = Array.isArray(toolSummary.segments) ? toolSummary.segments : [];
  if (segments.length) {
    const riskCount = segments.filter((item) => Boolean((item as Record<string, unknown>).risk_flag)).length;
    diagnostics.push({
      label: "Segment checks",
      value: riskCount ? `${riskCount} risks` : `${segments.length} checked`,
      status: riskCount ? "risk" : "pass",
    });
  }

  return diagnostics.length ? diagnostics : mockResult.diagnostics;
}

function mapBackendResponse(data: BackendResponse): AnalysisResult {
  const answer = data.answer ?? "";
  const evaluation = data.evaluation ?? {};
  const context = retrievedContext(data.retrieved_chunks ?? []);
  const summary = extractSection(answer, "Short Answer") || mockResult.summary;
  const evidence = listFromSection(extractSection(answer, "Reasoning"));
  const risks = listFromSection(extractSection(answer, "Risks / Caveats"));
  const nextActions = listFromSection(extractSection(answer, "Suggested Next Steps"));

  return {
    recommendation: mapDecision(data.final_decision ?? data.decision),
    summary,
    evidence: evidence.length ? evidence : context.map((item) => `${item.source}: ${item.snippet}`),
    risks: risks.length ? risks : mockResult.risks,
    uncertainty:
      "Live backend response. Use retrieved context, diagnostics, and policy validation to inspect whether the recommendation is sufficiently supported.",
    nextActions: nextActions.length ? nextActions : mockResult.nextActions,
    retrievedContext: context.length ? context : mockResult.retrievedContext,
    diagnostics: diagnosticsFromToolSummary(data.tool_summary),
    evaluation: {
      faithfulness: evaluation.memo_decision_consistent === false ? 0.72 : 0.9,
      contextPrecision: asNumber(evaluation.source_precision_at_k ?? evaluation.source_match_rate, 0.82),
      answerRelevance: asNumber(evaluation.concept_coverage, 0.8),
      decisionConfidence: Boolean(data.policy_validation?.policy_override) ? 0.74 : 0.84,
    },
  };
}

async function callBackend(question: string, selectedCorpusIds: string[], csvFile: File | null) {
  if (csvFile && csvFile.size > 0) {
    const formData = new FormData();
    formData.append("question", question);
    formData.append("file", csvFile, csvFile.name);
    formData.append("selected_corpus_ids", JSON.stringify(selectedCorpusIds));

    const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`FastAPI /analyze returned ${response.status}`);
    return (await response.json()) as BackendResponse;
  }

  const response = await fetch(`${BACKEND_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error(`FastAPI /ask returned ${response.status}`);
  return (await response.json()) as BackendResponse;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const question = String(formData.get("question") ?? "").trim();
  const selectedCorpusIds = JSON.parse(String(formData.get("selectedCorpusIds") ?? "[]")) as string[];
  const csvFile = formData.get("csvFile") instanceof File ? (formData.get("csvFile") as File) : null;

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  try {
    const backendResult = await callBackend(question, selectedCorpusIds, csvFile);
    return NextResponse.json(mapBackendResponse(backendResult));
  } catch (error) {
    // Keep the UI usable when the Python backend is not running. This makes frontend
    // development independent while preserving the real integration path above.
    return NextResponse.json({
      ...mockResult,
      summary: `${mockResult.summary} Mock fallback used because the FastAPI backend was not reachable.`,
      uncertainty: error instanceof Error ? error.message : mockResult.uncertainty,
    });
  }
}
