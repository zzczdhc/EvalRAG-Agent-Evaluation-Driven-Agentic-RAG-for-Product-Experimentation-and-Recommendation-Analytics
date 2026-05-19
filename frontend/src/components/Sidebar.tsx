"use client";

import { BookOpen, Check, History, Plus, Sparkles } from "lucide-react";
import { corpora } from "@/lib/mock-data";
import type { AnalysisHistoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const recommendationTone = {
  Launch: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Do Not Launch": "bg-rose-50 text-rose-700 ring-rose-200",
  "Launch with Guardrails": "bg-blue-50 text-blue-700 ring-blue-200",
  "Needs More Investigation": "bg-amber-50 text-amber-700 ring-amber-200",
};

type SidebarProps = {
  selectedCorpusIds: string[];
  historyItems: AnalysisHistoryItem[];
  onToggleCorpus: (id: string) => void;
  onNewAnalysis: () => void;
};

export function Sidebar({ selectedCorpusIds, historyItems, onToggleCorpus, onNewAnalysis }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-[310px] shrink-0 border-r border-white/70 bg-white/56 px-4 py-5 shadow-soft backdrop-blur-glass lg:block">
      <div className="flex h-full flex-col gap-6">
        <div className="rounded-[28px] border border-white/80 bg-white/64 p-4 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white shadow-soft">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">EvalRAG</h1>
              <p className="text-xs leading-4 text-graphite">Evaluation-Driven Product Analytics Agent</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNewAnalysis}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-black"
          >
            <Plus size={17} />
            New analysis
          </button>
        </div>

        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-graphite">
            <History size={14} />
            History
          </div>
          <div className="space-y-2">
            {historyItems.length ? historyItems.map((item) => (
              <button
                key={item.id}
                className="w-full rounded-2xl border border-white/70 bg-white/54 p-3 text-left shadow-sm transition hover:bg-white/82"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium text-ink">{item.title}</p>
                  <span className="shrink-0 text-[11px] text-graphite">{item.timestamp}</span>
                </div>
                <span
                  className={cn(
                    "mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1",
                    recommendationTone[item.recommendation],
                  )}
                >
                  {item.recommendation}
                </span>
              </button>
            )) : (
              <div className="rounded-2xl border border-white/70 bg-white/40 p-3 text-xs leading-5 text-graphite shadow-sm">
                Session history appears after you run an analysis.
              </div>
            )}
          </div>
        </section>

        <section className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-graphite">
              <BookOpen size={14} />
              Retrieval scope
            </div>
            <span className="rounded-full border border-white/80 bg-white/70 px-2 py-1 text-[11px] font-semibold text-graphite shadow-sm">
              {selectedCorpusIds.length}/{corpora.length}
            </span>
          </div>
          <p className="px-1 text-xs leading-5 text-graphite">
            Default is all scopes. Uncheck one only when you want retrieval to ignore that document group.
          </p>
          <div className="space-y-2">
            {corpora.map((corpus) => {
              const selected = selectedCorpusIds.includes(corpus.id);
              return (
              <button
                key={corpus.id}
                type="button"
                onClick={() => onToggleCorpus(corpus.id)}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left shadow-sm transition",
                  selected
                    ? "border-blue-200 bg-blueglass text-ink"
                    : "border-white/70 bg-white/48 text-graphite hover:bg-white/82",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold leading-5 text-ink">{corpus.name}</h3>
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1",
                      selected ? "bg-ink text-white ring-ink" : "bg-white text-transparent ring-slate-200",
                    )}
                  >
                    <Check size={12} />
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-graphite">{corpus.description}</p>
                <p className="mt-2 text-[11px] font-medium text-graphite">{corpus.documentCount} mapped files</p>
                <p className="mt-1 line-clamp-2 font-mono text-[10px] leading-4 text-slate-500">
                  {corpus.sources.join(", ")}
                </p>
              </button>
            );})}
          </div>
        </section>
      </div>
    </aside>
  );
}
