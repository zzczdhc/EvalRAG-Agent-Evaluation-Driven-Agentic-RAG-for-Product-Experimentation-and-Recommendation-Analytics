"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleMinus, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { formatMetricName, formatNumber, formatPercent } from "@/lib/decisions";
import type { AnalysisResult, MetricDiagnostic } from "@/lib/types";
import { cn } from "@/lib/utils";

const metricTone: Record<MetricDiagnostic["status"], string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  risk: "border-rose-200 bg-rose-50 text-rose-800",
};

export function DiagnosticsPanel({ result }: { result: AnalysisResult }) {
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<"all" | "risk">("all");
  const visibleSegments = segmentFilter === "risk" ? result.segments.filter((segment) => segment.riskFlag) : result.segments;
  const validationLabel = !result.validation ? "Not returned" : result.validation.valid ? "Valid" : "Needs attention";
  const validationTone = !result.validation
    ? "border-slate-200 bg-slate-50 text-graphite"
    : result.validation.valid
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  const srmLabel = !result.srm || result.srm.classification === "not_run"
    ? "Not run"
    : result.srm.classification === "pass"
      ? "Passed"
      : "Failed";
  const srmTone = !result.srm || result.srm.classification === "not_run"
    ? "border-slate-200 bg-slate-50 text-graphite"
    : result.srm.classification === "pass"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-rose-200 bg-rose-50 text-rose-800";

  if (!result.validation && !result.srm && !result.metrics.length) {
    return (
      <section className="data-card tab-enter p-8 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-graphite">
          <FileSpreadsheet size={19} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">No CSV diagnostics for this run</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-graphite">Attach an experiment CSV to compute validation, SRM, metric lifts, confidence intervals, significance tests, and segment risks.</p>
      </section>
    );
  }

  return (
    <div className="tab-enter space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="data-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!result.validation ? <CircleMinus size={16} className="text-slate-400" /> : result.validation.valid ? <CheckCircle2 size={16} className="text-success" /> : <ShieldAlert size={16} className="text-danger" />}
              <h3 className="text-sm font-semibold text-ink">CSV validation</h3>
            </div>
            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", validationTone)}>
              {validationLabel}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Rows</p>
              <p className="mt-1 text-sm font-semibold text-ink">{result.validation?.rowCount?.toLocaleString() ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Columns</p>
              <p className="mt-1 text-sm font-semibold text-ink">{result.validation?.columns.length ?? 0}</p>
            </div>
          </div>
          {result.validation?.errors.length ? (
            <ul className="mt-3 space-y-1 rounded-xl bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800">
              {result.validation.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
          {result.validation?.warnings.length ? (
            <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
              {result.validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </section>

        <section className="data-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!result.srm || result.srm.classification === "not_run" ? <CircleMinus size={16} className="text-slate-400" /> : result.srm.classification === "pass" ? <CheckCircle2 size={16} className="text-success" /> : <AlertTriangle size={16} className="text-danger" />}
              <h3 className="text-sm font-semibold text-ink">Sample ratio mismatch</h3>
            </div>
            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", srmTone)}>
              {srmLabel}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Control</p>
              <p className="mt-1 text-sm font-semibold text-ink">{result.srm?.controlN?.toLocaleString() ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Treatment</p>
              <p className="mt-1 text-sm font-semibold text-ink">{result.srm?.treatmentN?.toLocaleString() ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">p-value</p>
              <p className="mt-1 text-sm font-semibold text-ink">{formatNumber(result.srm?.pValue ?? null, 5)}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="data-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-ink">Metric diagnostics</h3>
            <p className="mt-1 text-xs text-graphite">Significance is interpreted together with effect direction and guardrail risk.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-graphite">{result.metrics.length} metrics</span>
        </div>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="min-w-[760px] w-full border-collapse text-left">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-5 py-3">Metric</th>
                <th className="px-3 py-3">Control</th>
                <th className="px-3 py-3">Treatment</th>
                <th className="px-3 py-3">Lift</th>
                <th className="px-3 py-3">p-value</th>
                <th className="px-3 py-3">Status</th>
                <th className="w-12 px-3 py-3"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {result.metrics.map((metric) => {
                const expanded = expandedMetric === metric.metric;
                return [
                  <tr key={metric.metric} className="bg-white">
                    <td className="px-5 py-3 font-semibold text-ink">{formatMetricName(metric.metric)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-graphite">{formatNumber(metric.controlMean)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-graphite">{formatNumber(metric.treatmentMean)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-ink">{formatPercent(metric.liftPct)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-graphite">{formatNumber(metric.pValue, 5)}</td>
                    <td className="px-3 py-3">
                      <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", metricTone[metric.status])}>{metric.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => setExpandedMetric(expanded ? null : metric.metric)} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-graphite hover:bg-slate-100" aria-label={`${expanded ? "Hide" : "Show"} ${metric.metric} details`}>
                        <ChevronDown size={15} className={cn("transition duration-200", expanded && "rotate-180")} />
                      </button>
                    </td>
                  </tr>,
                  expanded ? (
                    <tr key={`${metric.metric}-details`} className="tab-enter bg-slate-50/70">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="grid gap-3 text-xs sm:grid-cols-3">
                          <div><span className="text-slate-400">Absolute lift</span><p className="mt-1 font-mono font-semibold text-ink">{formatNumber(metric.absoluteLift)}</p></div>
                          <div><span className="text-slate-400">95% confidence interval</span><p className="mt-1 font-mono font-semibold text-ink">[{formatNumber(metric.ciLower)}, {formatNumber(metric.ciUpper)}]</p></div>
                          <div><span className="text-slate-400">Guardrail risk flag</span><p className="mt-1 font-semibold text-ink">{metric.riskFlag ? "Triggered" : "Not triggered"}</p></div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>

      {result.segments.length ? (
        <section className="data-card overflow-hidden">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-ink">Segment diagnostics</h3>
              <p className="mt-1 text-xs text-graphite">Risk-flagged segments are sorted first.</p>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["all", "risk"] as const).map((filter) => (
                <button key={filter} type="button" aria-pressed={segmentFilter === filter} onClick={() => setSegmentFilter(filter)} className={cn("focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150", segmentFilter === filter ? "bg-white text-ink shadow-sm" : "text-graphite")}>
                  {filter === "all" ? "All segments" : "Risks only"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                <tr><th className="px-5 py-3">Segment</th><th className="px-3 py-3">Metric</th><th className="px-3 py-3">Control</th><th className="px-3 py-3">Treatment</th><th className="px-3 py-3">Lift</th><th className="px-3 py-3">Risk</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleSegments.map((segment) => (
                  <tr key={`${segment.segment}-${segment.metric}`}>
                    <td className="px-5 py-3 font-semibold text-ink">{segment.segment}</td>
                    <td className="px-3 py-3 text-graphite">{formatMetricName(segment.metric)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-graphite">{formatNumber(segment.controlMean)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-graphite">{formatNumber(segment.treatmentMean)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-ink">{formatPercent(segment.liftPct)}</td>
                    <td className="px-3 py-3"><span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", segment.riskFlag ? metricTone.risk : metricTone.neutral)}>{segment.riskFlag ? "risk" : "clear"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
