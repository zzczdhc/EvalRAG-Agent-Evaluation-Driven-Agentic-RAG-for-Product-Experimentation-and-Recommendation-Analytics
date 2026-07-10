import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Database, ShieldAlert } from "lucide-react";
import { DecisionChain } from "@/components/DecisionChain";
import { decisionMeta } from "@/lib/decisions";
import type { AnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DecisionOverview({ result }: { result: AnalysisResult }) {
  const meta = decisionMeta[result.decision];
  const validationLabel = result.validation
    ? result.validation.valid ? "CSV valid" : "CSV invalid"
    : "Question only";

  return (
    <div className="tab-enter space-y-4">
      <section className={cn("rounded-[22px] border p-5 shadow-[0_10px_32px_rgba(15,23,42,0.055)] sm:p-6", meta.tone)}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              Final recommendation
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{meta.label}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 opacity-90 sm:text-base">{result.summary}</p>
          </div>
          <div className="grid min-w-[220px] grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="rounded-xl border border-current/10 bg-white/45 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] opacity-60"><Database size={11} /> Evidence</div>
              <p className="mt-1 text-sm font-semibold">{result.retrievedContext.length} chunks</p>
            </div>
            <div className="rounded-xl border border-current/10 bg-white/45 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] opacity-60"><CheckCircle2 size={11} /> Data</div>
              <p className="mt-1 text-sm font-semibold">{validationLabel}</p>
            </div>
            <div className="rounded-xl border border-current/10 bg-white/45 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] opacity-60"><Clock3 size={11} /> Runtime</div>
              <p className="mt-1 text-sm font-semibold">{result.latencySeconds === null ? "—" : `${result.latencySeconds.toFixed(1)}s`}</p>
            </div>
          </div>
        </div>
      </section>

      <DecisionChain chain={result.decisionChain} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="data-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-success" />
            <h3 className="text-sm font-semibold text-ink">Evidence used</h3>
          </div>
          {result.evidence.length ? (
            <ul className="mt-3 space-y-2.5">
              {result.evidence.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-6 text-graphite">
                  <ArrowRight size={14} className="mt-1.5 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-graphite">No structured evidence bullets were returned.</p>}
        </section>

        <section className="data-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-caution" />
            <h3 className="text-sm font-semibold text-ink">Risks and uncertainty</h3>
          </div>
          {result.risks.length ? (
            <ul className="mt-3 space-y-2.5">
              {result.risks.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-6 text-graphite">
                  <AlertTriangle size={14} className="mt-1.5 shrink-0 text-caution" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 rounded-xl bg-amber-50/70 px-3 py-2.5 text-xs leading-5 text-amber-900">{result.uncertainty}</p>
        </section>
      </div>

      <section className="data-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-ink">Suggested next actions</h3>
        {result.nextActions.length ? (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {result.nextActions.map((item, index) => (
              <li key={item} className="flex gap-3 rounded-[14px] bg-slate-50 px-3 py-3 text-sm leading-6 text-graphite">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-sm text-graphite">No structured next actions were returned.</p>}
      </section>
    </div>
  );
}
