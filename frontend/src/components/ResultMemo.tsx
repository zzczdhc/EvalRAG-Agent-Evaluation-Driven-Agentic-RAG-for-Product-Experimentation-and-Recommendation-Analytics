"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Check, Clipboard, Download, FileSearch, Gauge, Route } from "lucide-react";
import { DecisionOverview } from "@/components/DecisionOverview";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { EvidencePanel } from "@/components/EvidencePanel";
import { TracePanel } from "@/components/TracePanel";
import { decisionMeta } from "@/lib/decisions";
import type { AnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type ResultTab = "decision" | "diagnostics" | "evidence" | "trace";

const tabs: Array<{ id: ResultTab; label: string; icon: typeof Clipboard }> = [
  { id: "decision", label: "Decision brief", icon: Clipboard },
  { id: "diagnostics", label: "Diagnostics", icon: Gauge },
  { id: "evidence", label: "Evidence", icon: FileSearch },
  { id: "trace", label: "Trace", icon: Route },
];

function LoadingPanel() {
  return (
    <section className="data-card state-enter overflow-hidden p-5 sm:p-6" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-slate-100"><div className="indeterminate-bar h-full w-1/2 rounded-full bg-accent" /></div>
      <div className="mt-5 flex items-start gap-3">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-accent" />
        <div>
          <h2 className="text-base font-semibold text-ink">Running live analysis</h2>
          <p className="mt-1 text-sm leading-6 text-graphite">Validating the request, computing available diagnostics, retrieving playbook evidence, applying policy checks, and writing the memo.</p>
          <p className="mt-2 text-xs text-slate-400">Only output returned by the live pipeline will appear here.</p>
        </div>
      </div>
    </section>
  );
}

export function ResultMemo({ result, isLoading = false }: { result: AnalysisResult | null; isLoading?: boolean }) {
  const [activeTab, setActiveTab] = useState<ResultTab>("decision");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  if (isLoading) return <LoadingPanel />;
  if (!result) return null;

  const meta = decisionMeta[result.decision];
  const queryId = result.trace?.queryId;
  const memoText = [
    `EvalRAG decision: ${meta.label}`,
    "",
    result.summary,
    "",
    "Evidence",
    ...result.evidence.map((item) => `- ${item}`),
    "",
    "Risks",
    ...result.risks.map((item) => `- ${item}`),
    "",
    "Next actions",
    ...result.nextActions.map((item, index) => `${index + 1}. ${item}`),
  ].join("\n");

  async function copyMemo() {
    try {
      await navigator.clipboard.writeText(memoText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 1600);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`result-tab-${nextTab.id}`)?.focus();
  }

  function downloadMemo() {
    const blob = new Blob([memoText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `evalrag-${queryId ?? "decision"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="state-enter space-y-3">
      <div className="glass-shell flex flex-col gap-3 rounded-[18px] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-center gap-2 px-1 text-xs font-medium text-graphite">
          <span className="h-2 w-2 rounded-full bg-success" />
          Live analysis result
          {result.trace?.queryId ? <span className="hidden font-mono text-[10px] text-slate-400 sm:inline">· {result.trace.queryId}</span> : null}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void copyMemo()} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-graphite transition duration-150 hover:text-ink">
            {copyStatus === "copied" ? <Check size={13} className="text-success" /> : <Clipboard size={13} />}
            <span aria-live="polite">{copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy memo"}</span>
          </button>
          <button type="button" onClick={downloadMemo} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-graphite transition duration-150 hover:text-ink">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      <div className="glass-shell overflow-x-auto rounded-[16px] p-1.5">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Analysis result sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`result-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`result-panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tabs.findIndex((item) => item.id === tab.id))}
                className={cn(
                  "focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition duration-150",
                  active ? "bg-ink text-white shadow-sm" : "text-graphite hover:bg-white hover:text-ink",
                )}
              >
                <Icon size={14} />
                {tab.label}
                {tab.id === "diagnostics" && result.metrics.length ? <span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", active ? "bg-white/15" : "bg-slate-100")}>{result.metrics.length}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`result-panel-${activeTab}`} aria-labelledby={`result-tab-${activeTab}`}>
        {activeTab === "decision" ? <DecisionOverview result={result} /> : null}
        {activeTab === "diagnostics" ? <DiagnosticsPanel result={result} /> : null}
        {activeTab === "evidence" ? <EvidencePanel result={result} /> : null}
        {activeTab === "trace" ? <TracePanel result={result} /> : null}
      </div>
    </section>
  );
}
