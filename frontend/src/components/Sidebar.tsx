"use client";

import { History, Plus, Sparkles, X } from "lucide-react";
import { decisionMeta } from "@/lib/decisions";
import type { AnalysisHistoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type SidebarProps = {
  historyItems: AnalysisHistoryItem[];
  activeHistoryId?: string;
  onSelectHistory: (item: AnalysisHistoryItem) => void;
  onNewAnalysis: () => void;
  mobile?: boolean;
  onClose?: () => void;
};

export function Sidebar({
  historyItems,
  activeHistoryId,
  onSelectHistory,
  onNewAnalysis,
  mobile = false,
  onClose,
}: SidebarProps) {
  return (
    <aside className={cn(
      "h-full w-[248px] shrink-0 border-r border-slate-200/80 bg-white/88",
      mobile ? "block w-full border-r-0" : "hidden lg:block",
    )}>
      <div className="flex h-full flex-col px-4 py-5">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white shadow-sm">
              <Sparkles size={17} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-ink">EvalRAG</p>
              <p className="text-[11px] text-graphite">Evidence desk</p>
            </div>
          </div>
          {mobile ? (
            <button type="button" onClick={onClose} className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-graphite hover:bg-slate-100" aria-label="Close runs">
              <X size={18} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onNewAnalysis}
          className="focus-ring mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-slate-800 active:scale-[0.99]"
        >
          <Plus size={16} />
          New analysis
        </button>

        <div className="mt-7 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-graphite">
          <History size={13} />
          Session runs
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {historyItems.length ? historyItems.map((item) => {
            const meta = decisionMeta[item.result.decision];
            const active = item.id === activeHistoryId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectHistory(item)}
                className={cn(
                  "focus-ring w-full rounded-xl border p-3 text-left transition duration-200",
                  active
                    ? "border-accent/25 bg-blue-50/75 shadow-sm"
                    : "border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50",
                )}
              >
                <p className="line-clamp-2 text-sm font-medium leading-5 text-ink">{item.question}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-graphite">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                    <span className="truncate">{meta.compact}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{item.timestamp}</span>
                </div>
              </button>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs leading-5 text-graphite">
              Completed runs stay here for this session. Select one to restore the full decision.
            </div>
          )}
        </div>

        <p className="mt-4 border-t border-slate-200 pt-4 text-[10px] leading-4 text-slate-400">
          EvalRAG is decision support, not an automated launch authority.
        </p>
      </div>
    </aside>
  );
}
