import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardList, FileText, Gauge, Route, ShieldAlert } from "lucide-react";
import type { AnalysisResult, DiagnosticResult, Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";

function summarizeDetails(details?: Record<string, unknown>) {
  if (!details) return "No detail payload.";
  const preferredKeys = [
    "task_type",
    "planned_tools",
    "retrieved_chunk_count",
    "top_sources",
    "status",
    "reasons",
    "final_decision",
    "policy_action",
  ];
  const lines = preferredKeys
    .filter((key) => details[key] !== undefined)
    .map((key) => `${key}: ${Array.isArray(details[key]) ? (details[key] as unknown[]).join(", ") : String(details[key])}`);
  return lines.length ? lines.join("\n") : JSON.stringify(details, null, 2);
}

type ResultMemoProps = {
  result: AnalysisResult | null;
  isLoading?: boolean;
};

const recommendationStyle: Record<Recommendation, string> = {
  Launch: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Do Not Launch": "bg-rose-50 text-rose-700 ring-rose-200",
  "Launch with Guardrails": "bg-blue-50 text-blue-700 ring-blue-200",
  "Needs More Investigation": "bg-amber-50 text-amber-700 ring-amber-200",
};

const diagnosticStyle: Record<DiagnosticResult["status"], string> = {
  pass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  watch: "bg-amber-50 text-amber-700 ring-amber-200",
  risk: "bg-rose-50 text-rose-700 ring-rose-200",
};

function MetricBar({ label, value }: { label: string; value?: number | null }) {
  const percent = typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-graphite">
        <span>{label}</span>
        <span>{percent === null ? "N/A" : `${percent}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200/80">
        <div
          className={cn("h-2 rounded-full", percent === null ? "bg-slate-300/70" : "bg-ink")}
          style={{ width: percent === null ? "14%" : `${Math.max(4, Math.min(percent, 100))}%` }}
        />
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-white/80 bg-white/60 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-ink ring-1 ring-slate-200">
          <Icon size={16} />
        </div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ThinkingPanel() {
  return (
    <section className="glass-panel liquid-edge rounded-[34px] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/80 bg-white/72 shadow-sm">
          <span className="h-4 w-4 rounded-full bg-ink thinking-shimmer" />
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span>Agent is thinking</span>
            <span className="flex items-center gap-1">
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-graphite" />
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-graphite" />
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-graphite" />
            </span>
          </div>
          <p className="mt-1 text-xs text-graphite">Planning · retrieving · validating</p>
        </div>
      </div>
    </section>
  );
}

export function ResultMemo({ result, isLoading = false }: ResultMemoProps) {
  if (isLoading) {
    return <ThinkingPanel />;
  }

  if (!result) {
    return (
      <section className="glass-panel liquid-edge rounded-[34px] p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white/76 text-ink shadow-soft ring-1 ring-white/80">
          <ClipboardList size={23} />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">Your launch memo will appear here</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
          Submit a question to generate a structured recommendation with evidence, retrieved playbook context,
          diagnostics, and evaluation metrics.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-panel liquid-edge rounded-[34px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite">Launch Decision Memo</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Recommendation</h2>
            <span className={cn("rounded-full px-3 py-1.5 text-sm font-semibold ring-1", recommendationStyle[result.recommendation])}>
              {result.recommendation}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-graphite">{result.summary}</p>
        </div>
        <div className="rounded-[22px] border border-white/80 bg-white/66 p-4 shadow-sm lg:w-[300px]">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Gauge size={16} />
            Live diagnostics
          </div>
          <div className="space-y-3">
            <MetricBar label="Faithfulness" value={result.evaluation.faithfulness} />
            <MetricBar label="Context precision" value={result.evaluation.contextPrecision} />
            <MetricBar label="Answer relevance" value={result.evaluation.answerRelevance} />
            <MetricBar label="Decision confidence" value={result.evaluation.decisionConfidence} />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-graphite">
            Full Ragas scores require saved eval records with ground truth; live questions only show metrics returned by the backend.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Section title="Evidence" icon={CheckCircle2}>
          <ul className="space-y-2 text-sm leading-6 text-graphite">
            {result.evidence.map((item) => (
              <li key={item} className="flex gap-2">
                <ArrowRight className="mt-1 shrink-0 text-emerald-600" size={14} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Risks" icon={ShieldAlert}>
          <ul className="space-y-2 text-sm leading-6 text-graphite">
            {result.risks.map((item) => (
              <li key={item} className="flex gap-2">
                <AlertTriangle className="mt-1 shrink-0 text-amber-600" size={14} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Section title="Diagnostics run" icon={BarChart3}>
          <div className="grid gap-2 sm:grid-cols-2">
            {result.diagnostics.map((diagnostic) => (
              <div key={diagnostic.label} className="rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">{diagnostic.label}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{diagnostic.value}</p>
                  <span className={cn("rounded-full px-2 py-1 text-[11px] font-semibold ring-1", diagnosticStyle[diagnostic.status])}>
                    {diagnostic.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Retrieved context" icon={FileText}>
          <div className="flex flex-wrap gap-2">
            {result.retrievedContext.map((context) => (
              <details key={`${context.source}-${context.score}`} className="group soft-reveal w-full rounded-2xl border border-white/80 bg-white/64 p-2 transition open:bg-white/82 sm:w-auto">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full px-2 py-1 text-sm font-semibold text-ink">
                  <span>{context.source}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-graphite ring-1 ring-slate-200">
                    {context.score.toFixed(2)}
                  </span>
                </summary>
                <div className="soft-reveal mt-2 rounded-xl border border-slate-100 bg-white/76 p-3 sm:w-[420px]">
                  <p className="text-sm leading-6 text-graphite">{context.snippet}</p>
                </div>
              </details>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Section title="Uncertainty" icon={AlertTriangle}>
          <p className="text-sm leading-7 text-graphite">{result.uncertainty}</p>
        </Section>
        <Section title="Suggested next actions" icon={ClipboardList}>
          <ol className="space-y-2 text-sm leading-6 text-graphite">
            {result.nextActions.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {result.trace ? (
        <div className="mt-4">
          <Section title="Agent trace" icon={Route}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Task type</p>
                <p className="mt-1 font-mono text-sm text-ink">{result.trace.taskType ?? "unknown"}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Evidence status</p>
                <p className="mt-1 font-mono text-sm text-ink">{result.trace.evidenceSufficiency ?? "unknown"}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Model backend</p>
                <p className="mt-1 font-mono text-sm text-ink">{result.trace.generatorBackend ?? "unknown"}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Top retrieval score</p>
                <p className="mt-1 font-mono text-sm text-ink">{(result.trace.topRetrievalScore ?? 0).toFixed(3)}</p>
              </div>
            </div>

            {result.trace.requiredTools?.length ? (
              <div className="mt-3 rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Tools planned</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.trace.requiredTools.map((tool) => (
                    <span key={tool} className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[11px] text-graphite ring-1 ring-slate-200">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {result.trace.selectedSources?.length ? (
              <div className="mt-3 rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Corpus-limited sources</p>
                <p className="mt-2 text-sm leading-6 text-graphite">{result.trace.selectedSources.join(", ")}</p>
              </div>
            ) : null}

            {result.trace.evidenceReasons?.length ? (
              <div className="mt-3 rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Evidence check reasons</p>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-graphite">
                  {result.trace.evidenceReasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <ArrowRight className="mt-1 shrink-0" size={13} />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.trace.steps?.length ? (
              <div className="mt-3 rounded-2xl border border-white/80 bg-white/64 p-3">
                <p className="text-xs font-medium text-graphite">Raw workflow trace</p>
                <div className="mt-3 space-y-2">
                  {result.trace.steps.map((step, index) => (
                    <details key={`${step.step}-${index}`} className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold text-ink">
                        {String(index + 1).padStart(2, "0")} · {step.step} · {step.status}
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                        {summarizeDetails(step.details)}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}

            {result.rawAnswer ? (
              <details className="mt-3 rounded-2xl border border-white/80 bg-white/64 p-3">
                <summary className="cursor-pointer text-xs font-medium text-graphite">Raw backend markdown</summary>
                <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                  {result.rawAnswer}
                </pre>
              </details>
            ) : null}
          </Section>
        </div>
      ) : null}
    </section>
  );
}
