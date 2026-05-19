import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardList, FileText, Gauge, ShieldAlert } from "lucide-react";
import type { AnalysisResult, DiagnosticResult, Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";

type ResultMemoProps = {
  result: AnalysisResult | null;
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

function MetricBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-graphite">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200/80">
        <div className="h-2 rounded-full bg-ink" style={{ width: `${percent}%` }} />
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

export function ResultMemo({ result }: ResultMemoProps) {
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
            Evaluation
          </div>
          <div className="space-y-3">
            <MetricBar label="Faithfulness" value={result.evaluation.faithfulness} />
            <MetricBar label="Context precision" value={result.evaluation.contextPrecision} />
            <MetricBar label="Answer relevance" value={result.evaluation.answerRelevance} />
            <MetricBar label="Decision confidence" value={result.evaluation.decisionConfidence} />
          </div>
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
          <div className="space-y-3">
            {result.retrievedContext.map((context) => (
              <article key={`${context.source}-${context.score}`} className="rounded-2xl border border-white/80 bg-white/64 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{context.source}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-graphite ring-1 ring-slate-200">
                    score {context.score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-graphite">{context.snippet}</p>
              </article>
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
    </section>
  );
}
