import { Activity, AlertTriangle, Braces, CheckCircle2, CircleDot, RotateCcw, Route, Settings2 } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";

function summarizeDetails(details?: Record<string, unknown>) {
  if (!details) return "No detail payload.";
  return JSON.stringify(details, null, 2);
}

function statusMeta(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("insufficient")) {
    return { Icon: AlertTriangle, className: "bg-rose-50 text-rose-800" };
  }
  if (normalized.includes("retry") || normalized.includes("override")) {
    return { Icon: RotateCcw, className: "bg-amber-50 text-amber-800" };
  }
  if (normalized.includes("complete") || normalized.includes("success") || normalized.includes("sufficient")) {
    return { Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-800" };
  }
  return { Icon: CircleDot, className: "bg-slate-100 text-graphite" };
}

export function TracePanel({ result }: { result: AnalysisResult }) {
  const trace = result.trace;
  const quality = [
    ["Faithfulness", result.evaluation.faithfulness],
    ["Context precision", result.evaluation.contextPrecision],
    ["Concept coverage", result.evaluation.answerRelevance],
    ["Decision confidence", result.evaluation.decisionConfidence],
  ].filter((item): item is [string, number] => typeof item[1] === "number" && Number.isFinite(item[1]));

  return (
    <div className="tab-enter space-y-4">
      <section className="data-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-ink">Actual run</h2>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Task", trace?.taskType ?? "unknown"],
            ["Evidence", trace?.evidenceSufficiency ?? "unknown"],
            ["Backend", trace?.generatorBackend ?? "unknown"],
            ["Model", trace?.model ?? result.model ?? "unknown"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
              <p className="mt-1 break-words font-mono text-xs text-ink">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {trace?.steps?.length ? (
        <section className="data-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Route size={16} className="text-accent" /><h2 className="text-sm font-semibold text-ink">Workflow trace</h2></div>
              <p className="mt-2 text-xs leading-5 text-graphite">Only steps recorded by this run are shown. No simulated progress is added.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-graphite">{trace.steps.length} steps</span>
          </div>
          <div className="mt-4 space-y-2">
            {trace.steps.map((step, index) => {
              const meta = statusMeta(step.status);
              const StatusIcon = meta.Icon;
              return (
                <details key={`${step.step}-${index}`} className="group rounded-[14px] border border-slate-200 bg-white px-3.5 py-3">
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-md">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 font-mono text-[10px] font-semibold text-graphite">{String(index + 1).padStart(2, "0")}</span>
                      <span className="truncate text-sm font-semibold text-ink">{step.step.replace(/_/g, " ")}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${meta.className}`}><StatusIcon size={10} />{step.status}</span>
                      <span className="text-graphite transition duration-200 group-open:rotate-90">›</span>
                    </span>
                  </summary>
                  <pre className="tab-enter mt-3 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">{summarizeDetails(step.details)}</pre>
                </details>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {trace?.agentPlan ? (
          <section className="data-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><Settings2 size={16} className="text-accent" /><h2 className="text-sm font-semibold text-ink">Agent plan</h2></div>
            <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">{JSON.stringify(trace.agentPlan, null, 2)}</pre>
          </section>
        ) : null}

        {quality.length ? (
          <section className="data-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><Activity size={16} className="text-accent" /><h2 className="text-sm font-semibold text-ink">Available quality signals</h2></div>
            <p className="mt-2 text-xs leading-5 text-graphite">Only metrics actually returned by this run are shown.</p>
            <div className="mt-3 space-y-3">
              {quality.map(([label, value]) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs"><span className="text-graphite">{label}</span><span className="font-mono font-semibold text-ink">{Math.round(value * 100)}%</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {result.rawAnswer ? (
        <section className="data-card p-4 sm:p-5">
          <details className="group">
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-md">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink"><Braces size={16} className="text-accent" />Raw backend memo</span>
              <span className="text-graphite transition duration-200 group-open:rotate-90">›</span>
            </summary>
            <pre className="tab-enter mt-3 max-h-[440px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">{result.rawAnswer}</pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
