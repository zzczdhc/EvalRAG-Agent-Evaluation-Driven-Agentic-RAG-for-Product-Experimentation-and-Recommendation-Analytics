"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileCheck2, PanelLeft, Plus, SearchCheck, ShieldCheck, X } from "lucide-react";
import { InputPanel } from "@/components/InputPanel";
import { ResultMemo } from "@/components/ResultMemo";
import { Sidebar } from "@/components/Sidebar";
import type { AnalysisHistoryItem, AnalysisResult } from "@/lib/types";

export function AnalyticsWorkspace() {
  const [question, setQuestion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedCorpusIds, setSelectedCorpusIds] = useState<string[]>(["all-playbooks"]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<AnalysisHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string>();
  const [mobileRunsOpen, setMobileRunsOpen] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const mobileRunsButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileRunsOpen) return;
    const dialog = mobileDialogRef.current;
    const returnFocusTarget = mobileRunsButtonRef.current;
    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)) : [];
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileRunsOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusTarget?.focus();
    };
  }, [mobileRunsOpen]);

  function toggleCorpus(id: string) {
    setSelectedCorpusIds((current) => {
      if (id === "all-playbooks") return ["all-playbooks"];
      const focused = current.filter((item) => item !== "all-playbooks");
      const next = focused.includes(id) ? focused.filter((item) => item !== id) : [...focused, id];
      return next.length ? next : ["all-playbooks"];
    });
  }

  function recordHistory(submittedQuestion: string, analysisResult: AnalysisResult, submittedFileName?: string) {
    const id = analysisResult.trace?.queryId ?? `${Date.now()}`;
    const item: AnalysisHistoryItem = {
      id,
      question: submittedQuestion,
      timestamp: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date()),
      result: analysisResult,
      fileName: submittedFileName,
    };
    setActiveHistoryId(id);
    setHistoryItems((current) => [item, ...current.filter((existing) => existing.id !== id)].slice(0, 8));
  }

  function newAnalysis() {
    setQuestion("");
    setFile(null);
    setResult(null);
    setError(null);
    setIsAnalyzing(false);
    setActiveHistoryId(undefined);
    setMobileRunsOpen(false);
    setRequestVersion((current) => current + 1);
  }

  function restoreHistory(item: AnalysisHistoryItem) {
    setQuestion(item.question);
    setFile(null);
    setResult(item.result);
    setError(null);
    setIsAnalyzing(false);
    setActiveHistoryId(item.id);
    setMobileRunsOpen(false);
    setRequestVersion((current) => current + 1);
  }

  return (
    <main className="min-h-screen text-ink">
      <div className="flex min-h-screen">
        <div className="sticky top-0 hidden h-screen lg:block">
          <Sidebar
            historyItems={historyItems}
            activeHistoryId={activeHistoryId}
            onSelectHistory={restoreHistory}
            onNewAnalysis={newAnalysis}
          />
        </div>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/90 bg-mist/80 px-4 py-3 backdrop-blur-2xl sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button ref={mobileRunsButtonRef} type="button" onClick={() => setMobileRunsOpen(true)} className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-graphite lg:hidden" aria-label="Open session runs">
                  <PanelLeft size={18} />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">Experiment Decision Workspace</p>
                    <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 sm:inline-flex">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Live analysis enabled
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-graphite">Computed diagnostics · retrieved policy · auditable decision</p>
                </div>
              </div>
              <button type="button" onClick={newAnalysis} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-graphite transition duration-150 hover:text-ink">
                <Plus size={14} /> <span className="hidden sm:inline">New analysis</span>
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pt-10 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">EvalRAG Evidence Desk</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">
                {result ? "Review the evidence before you ship." : "Should this experiment ship?"}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-graphite sm:text-base">
                Ask a product experiment question, optionally attach a CSV, and inspect the computed diagnostics, retrieved playbook evidence, and policy-constrained recommendation.
              </p>
            </div>

            <div className="mt-7">
              <InputPanel
                question={question}
                file={file}
                selectedCorpusIds={selectedCorpusIds}
                isLoading={isAnalyzing}
                requestVersion={requestVersion}
                showExamples={!result && !isAnalyzing}
                onQuestionChange={setQuestion}
                onFileChange={setFile}
                onToggleCorpus={toggleCorpus}
                onResult={setResult}
                onLoadingChange={(loading) => {
                  setIsAnalyzing(loading);
                  if (loading) {
                    setResult(null);
                    setActiveHistoryId(undefined);
                  }
                }}
                onQuestionSubmitted={recordHistory}
                onError={setError}
              />
            </div>

            {error ? (
              <div className="state-enter mt-4 flex items-start justify-between gap-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
                <div className="flex gap-2.5"><AlertCircle size={17} className="mt-0.5 shrink-0" /><p className="leading-6">{error}</p></div>
                <button type="button" onClick={() => setError(null)} className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-rose-100" aria-label="Dismiss error"><X size={15} /></button>
              </div>
            ) : null}

            <div className="mt-5">
              <ResultMemo key={result?.trace?.queryId ?? result?.summary ?? "empty"} result={result} isLoading={isAnalyzing} />
            </div>

            {!result && !isAnalyzing ? (
              <section className="state-enter mt-5 grid gap-3 md:grid-cols-3" aria-label="How EvalRAG analyzes a request">
                {[
                  { icon: FileCheck2, title: "Compute", copy: "Validate experiment data and calculate SRM, lifts, uncertainty, and segment risk when a CSV is attached." },
                  { icon: SearchCheck, title: "Retrieve", copy: "Search only the selected product experimentation playbooks and preserve the ranked evidence chunks." },
                  { icon: ShieldCheck, title: "Constrain", copy: "Apply explicit launch policies to confirm or override the draft recommendation, then record the full trace." },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="data-card p-4">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-accent"><Icon size={16} /></div>
                      <h2 className="mt-3 text-sm font-semibold text-ink">{item.title}</h2>
                      <p className="mt-1.5 text-xs leading-5 text-graphite">{item.copy}</p>
                    </div>
                  );
                })}
              </section>
            ) : null}
          </div>
        </section>
      </div>

      {mobileRunsOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Session runs">
          <button type="button" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setMobileRunsOpen(false)} aria-label="Close session runs" />
          <div ref={mobileDialogRef} className="state-enter absolute inset-y-0 left-0 w-[min(86vw,320px)] shadow-2xl">
            <Sidebar
              mobile
              historyItems={historyItems}
              activeHistoryId={activeHistoryId}
              onSelectHistory={restoreHistory}
              onNewAnalysis={newAnalysis}
              onClose={() => setMobileRunsOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
