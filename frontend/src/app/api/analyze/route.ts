import { NextResponse } from "next/server";
import type {
  AnalysisResult,
  DecisionCode,
  MetricDiagnostic,
  PolicyFinding,
  RetrievedContext,
  SegmentDiagnostic,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 12;
const DECISIONS = new Set<DecisionCode>([
  "launch",
  "do_not_launch",
  "partial_rollout",
  "investigate_further",
  "do_not_trust_result",
  "use_did_or_quasi_experiment",
]);

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
  llm_decision?: string;
  policy_decision?: string;
  final_decision?: string;
  retrieved_chunks?: BackendChunk[];
  evaluation?: Record<string, unknown>;
  policy_validation?: Record<string, unknown>;
  tool_summary?: Record<string, unknown>;
  trace?: Record<string, unknown>;
  latency_seconds?: number;
  model?: string;
  generator_backend?: string;
  generator_error?: string | null;
};

type RateLimitEntry = { count: number; resetAt: number };

const globalRateLimit = globalThis as typeof globalThis & {
  __evalragRateLimit?: Map<string, RateLimitEntry>;
};
const rateLimitStore = globalRateLimit.__evalragRateLimit ?? new Map<string, RateLimitEntry>();
globalRateLimit.__evalragRateLimit = rateLimitStore;

class BackendHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "BackendHttpError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asDecision(value: unknown): DecisionCode | null {
  return typeof value === "string" && DECISIONS.has(value as DecisionCode) ? (value as DecisionCode) : null;
}

function requireDecision(value: unknown, field: string): DecisionCode {
  const decision = asDecision(value);
  if (!decision) throw new Error(`The live service returned an invalid ${field}.`);
  return decision;
}

function optionalDecision(value: unknown, field: string): DecisionCode | null {
  if (value === undefined || value === null || value === "") return null;
  return requireDecision(value, field);
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
    .slice(0, 8);
}

function mapRetrievedContext(chunks: BackendChunk[] = []): RetrievedContext[] {
  return chunks
    .map((chunk) => ({
      source: chunk.source ?? "unknown source",
      snippet: chunk.text ?? chunk.text_preview ?? "",
      score: asNumber(chunk.score ?? chunk.similarity_score) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function mapValidation(toolSummary?: Record<string, unknown>) {
  const validation = record(toolSummary?.validation);
  if (!validation) return null;
  const rawCounts = record(validation.group_counts) ?? {};
  const groupCounts = Object.fromEntries(
    Object.entries(rawCounts)
      .map(([key, value]) => [key, asNumber(value)])
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );
  return {
    valid: validation.valid === true,
    rowCount: asNumber(validation.row_count),
    columns: stringList(validation.columns),
    errors: stringList(validation.errors),
    warnings: stringList(validation.warnings),
    groupCounts,
  };
}

function mapSrm(toolSummary?: Record<string, unknown>) {
  const srm = record(toolSummary?.srm);
  if (!srm) return null;
  const classification: "pass" | "fail" | "not_run" =
    srm.classification === "pass" || srm.classification === "fail" ? srm.classification : "not_run";
  return {
    classification,
    controlN: asNumber(srm.control_n),
    treatmentN: asNumber(srm.treatment_n),
    pValue: asNumber(srm.p_value),
    alpha: asNumber(srm.alpha),
    reason: typeof srm.reason === "string" ? srm.reason : undefined,
  };
}

function mapMetrics(toolSummary?: Record<string, unknown>): MetricDiagnostic[] {
  const lifts = Array.isArray(toolSummary?.metric_lifts) ? toolSummary.metric_lifts.map(record).filter(isRecord) : [];
  const tests = Array.isArray(toolSummary?.tests) ? toolSummary.tests.map(record).filter(isRecord) : [];
  const testsByMetric = new Map(tests.map((item) => [String(item?.metric ?? ""), item]));

  return lifts.map((item) => {
    const metric = String(item?.metric ?? "metric");
    const test = testsByMetric.get(metric);
    const lift = asNumber(item?.absolute_lift);
    const pValue = asNumber(test?.p_value);
    const riskFlag = asBoolean(item?.risk_flag);
    const status = riskFlag ? "risk" : lift !== null && lift > 0 && pValue !== null && pValue < 0.05 ? "positive" : "neutral";
    return {
      metric,
      controlMean: asNumber(item?.control_mean),
      treatmentMean: asNumber(item?.treatment_mean),
      absoluteLift: lift,
      liftPct: asNumber(item?.lift_pct),
      ciLower: asNumber(item?.ci_lower),
      ciUpper: asNumber(item?.ci_upper),
      pValue,
      riskFlag,
      status,
    };
  });
}

function mapSegments(toolSummary?: Record<string, unknown>): SegmentDiagnostic[] {
  const rawSegments = Array.isArray(toolSummary?.segments) ? toolSummary.segments.map(record).filter(isRecord) : [];
  return rawSegments
    .map((item) => {
      const lift = asNumber(item?.absolute_lift);
      const riskFlag = asBoolean(item?.risk_flag);
      return {
        segment: String(item?.segment ?? "unknown"),
        metric: String(item?.metric ?? "metric"),
        controlMean: asNumber(item?.control_mean),
        treatmentMean: asNumber(item?.treatment_mean),
        absoluteLift: lift,
        liftPct: asNumber(item?.lift_pct),
        ciLower: asNumber(item?.ci_lower),
        ciUpper: asNumber(item?.ci_upper),
        pValue: null,
        riskFlag,
        status: riskFlag ? "risk" as const : "neutral" as const,
      };
    })
    .sort((a, b) => Number(b.riskFlag) - Number(a.riskFlag) || a.segment.localeCompare(b.segment));
}

function mapPolicyFindings(policyValidation: Record<string, unknown>): PolicyFinding[] {
  const findings = Array.isArray(policyValidation.policy_findings)
    ? policyValidation.policy_findings.map(record).filter(isRecord)
    : [];
  return findings.map((finding) => ({
    policyId: String(finding?.policy_id ?? "policy_check"),
    recommendedDecision: requireDecision(finding?.recommended_decision, "policy finding decision"),
    reason: String(finding?.reason ?? "Policy rule applied."),
    evidence: String(finding?.evidence ?? "unspecified"),
    severity: typeof finding?.severity === "string" ? finding.severity : undefined,
  }));
}

function mapTrace(data: BackendResponse) {
  const trace = data.trace ?? {};
  const evidenceCheck = record(trace.evidence_check);
  const traceSteps = Array.isArray(trace.trace_steps)
    ? trace.trace_steps
        .map(record)
        .filter(isRecord)
        .map((item) => ({
          step: typeof item?.step === "string" ? item.step : "unknown",
          status: typeof item?.status === "string" ? item.status : "completed",
          details: record(item?.details),
        }))
    : [];
  return {
    queryId: typeof trace.query_id === "string" ? trace.query_id : undefined,
    taskType: typeof trace.task_type === "string" ? trace.task_type : undefined,
    agentPlan: record(trace.agent_plan),
    requiredTools: stringList(trace.required_tools),
    selectedCorpusIds: stringList(trace.selected_corpus_ids),
    selectedSources: stringList(trace.selected_sources),
    evidenceSufficiency: typeof trace.evidence_sufficiency === "string" ? trace.evidence_sufficiency : undefined,
    evidenceReasons: stringList(evidenceCheck?.reasons),
    topRetrievalScore: asNumber(evidenceCheck?.top_score) ?? undefined,
    generatorBackend: typeof trace.generator_backend === "string" ? trace.generator_backend : data.generator_backend,
    model: typeof trace.model === "string" ? trace.model : data.model,
    steps: traceSteps,
  };
}

function mapBackendResponse(data: BackendResponse): AnalysisResult {
  const answer = data.answer ?? "";
  const trace = data.trace ?? {};
  const decisionJson = record(trace.decision_json);
  const policyValidation = data.policy_validation ?? record(trace.policy_validation) ?? {};
  const finalDecision = requireDecision(data.final_decision ?? data.decision ?? decisionJson?.decision, "final decision");
  const draftDecision = optionalDecision(data.llm_decision ?? decisionJson?.decision, "draft decision") ?? finalDecision;
  const policyDecision = optionalDecision(data.policy_decision, "policy decision");
  const context = mapRetrievedContext(data.retrieved_chunks);
  const evidence = listFromSection(extractSection(answer, "Reasoning"));
  const policyFindings = mapPolicyFindings(policyValidation);
  const risks = listFromSection(extractSection(answer, "Risks / Caveats"));
  const nextActions = listFromSection(extractSection(answer, "Suggested Next Steps"));
  const traceResult = mapTrace(data);
  const evaluation = data.evaluation ?? {};
  const primaryReason = typeof decisionJson?.primary_reason === "string" ? decisionJson.primary_reason : "";
  const policyAction: "override" | "confirm" | "none" =
    policyValidation.policy_action === "override" || policyValidation.policy_action === "confirm"
    ? policyValidation.policy_action
    : "none";

  return {
    mode: "live",
    decision: finalDecision,
    summary: extractSection(answer, "Short Answer") || primaryReason || "The analysis completed without a structured short answer.",
    rawAnswer: answer,
    evidence: evidence.length ? evidence : context.map((item) => `${item.source}: ${item.snippet}`),
    risks: risks.length ? risks : policyFindings.map((finding) => finding.reason),
    uncertainty: traceResult.evidenceReasons?.length
      ? traceResult.evidenceReasons.join(" · ")
      : data.generator_error || "No additional uncertainty statement was returned.",
    nextActions: nextActions.length ? nextActions : stringList(decisionJson?.required_next_steps),
    retrievedContext: context,
    validation: mapValidation(data.tool_summary),
    srm: mapSrm(data.tool_summary),
    metrics: mapMetrics(data.tool_summary),
    segments: mapSegments(data.tool_summary),
    evaluation: {
      faithfulness: asNumber(evaluation.faithfulness),
      contextPrecision: asNumber(evaluation.source_precision_at_k ?? evaluation.source_match_rate),
      answerRelevance: asNumber(evaluation.concept_coverage),
      decisionConfidence: asNumber(decisionJson?.confidence),
    },
    decisionChain: {
      draftDecision,
      policyDecision,
      finalDecision,
      policyAction,
      findings: policyFindings,
    },
    trace: traceResult,
    latencySeconds: asNumber(data.latency_seconds),
    model: data.model,
  };
}

function backendBaseUrl(request: Request) {
  const configured = process.env.EVALRAG_BACKEND_URL ?? process.env.BACKEND_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL) return `${new URL(request.url).origin}/server`;
  return "http://127.0.0.1:8000";
}

function rateLimit(request: Request) {
  if (process.env.NODE_ENV !== "production") return { allowed: true, retryAfter: 0 };
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

async function throwBackendError(response: Response): Promise<never> {
  let detail = `Live analysis service returned ${response.status}.`;
  try {
    const payload = (await response.json()) as { detail?: unknown; error?: unknown };
    if (typeof payload.detail === "string") detail = payload.detail;
    else if (typeof payload.error === "string") detail = payload.error;
  } catch {
    // Keep the status-based fallback when the upstream body is not JSON.
  }
  throw new BackendHttpError(response.status, detail);
}

async function callBackend(baseUrl: string, question: string, selectedCorpusIds: string[], csvFile: File | null) {
  if (csvFile) {
    const payload = new FormData();
    payload.append("question", question);
    payload.append("file", csvFile, csvFile.name);
    payload.append("selected_corpus_ids", JSON.stringify(selectedCorpusIds));
    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) await throwBackendError(response);
    return (await response.json()) as BackendResponse;
  }

  const response = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, selected_corpus_ids: selectedCorpusIds }),
    cache: "no-store",
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) await throwBackendError(response);
  return (await response.json()) as BackendResponse;
}

export async function POST(request: Request) {
  const requestLimit = rateLimit(request);
  if (!requestLimit.allowed) {
    return NextResponse.json(
      { mode: "error", error: "This demo has reached its short-term analysis limit. Please try again soon." },
      { status: 429, headers: { "Retry-After": String(requestLimit.retryAfter), "Cache-Control": "no-store" } },
    );
  }
  try {
    const formData = await request.formData();
    const question = String(formData.get("question") ?? "").trim();
    const rawScopes = String(formData.get("selectedCorpusIds") ?? "[]");
    const csvFile = formData.get("csvFile") instanceof File ? (formData.get("csvFile") as File) : null;

    if (question.length < 3) {
      return NextResponse.json({ mode: "error", error: "Please enter a specific experiment question." }, { status: 400 });
    }

    let selectedCorpusIds: string[];
    try {
      selectedCorpusIds = stringList(JSON.parse(rawScopes));
    } catch {
      return NextResponse.json({ mode: "error", error: "Retrieval scope is invalid." }, { status: 400 });
    }
    if (!selectedCorpusIds.length) {
      return NextResponse.json({ mode: "error", error: "Select at least one retrieval scope." }, { status: 400 });
    }

    if (csvFile) {
      if (!csvFile.name.toLowerCase().endsWith(".csv")) {
        return NextResponse.json({ mode: "error", error: "Only CSV experiment files are supported." }, { status: 400 });
      }
      if (csvFile.size > MAX_FILE_BYTES) {
        return NextResponse.json({ mode: "error", error: "CSV exceeds the 5 MB upload limit." }, { status: 413 });
      }
    }

    const backendResult = await callBackend(backendBaseUrl(request), question, selectedCorpusIds, csvFile);
    return NextResponse.json(mapBackendResponse(backendResult), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown live analysis failure.";
    const status = error instanceof BackendHttpError && error.status >= 400 && error.status < 500 ? error.status : 502;
    console.error("EvalRAG live analysis failed", error);
    return NextResponse.json(
      {
        mode: "error",
        error: status < 500
          ? "The request could not be analyzed. No mock result was substituted."
          : "The live analysis could not be completed. No mock result was substituted.",
        detail,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
