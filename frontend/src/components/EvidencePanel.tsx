"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, Search } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";

const highlightTerms = [
  "sample ratio mismatch",
  "guardrail",
  "retention",
  "revenue",
  "conversion",
  "segment",
  "launch",
  "rollout",
  "randomized",
  "treatment",
  "control",
  "SRM",
  "p-value",
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedSnippet({ text }: { text: string }) {
  const pattern = new RegExp(`(${highlightTerms.map(escapeRegex).join("|")})`, "gi");
  return text.split(pattern).map((part, index) => {
    const match = highlightTerms.some((term) => term.toLowerCase() === part.toLowerCase());
    return match
      ? <mark key={`${part}-${index}`} className="rounded bg-blue-50 px-0.5 text-blue-900">{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function EvidencePanel({ result }: { result: AnalysisResult }) {
  const [copyState, setCopyState] = useState<{ source: string; status: "copied" | "failed" } | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  async function copyCitation(source: string, snippet: string) {
    try {
      await navigator.clipboard.writeText(`${source}\n${snippet}`);
      setCopyState({ source, status: "copied" });
    } catch {
      setCopyState({ source, status: "failed" });
    }
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState(null), 1600);
  }

  if (!result.retrievedContext.length) {
    return (
      <section className="data-card tab-enter p-8 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-graphite"><Search size={19} /></div>
        <h2 className="mt-4 text-lg font-semibold text-ink">No retrieved context was returned</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-graphite">The decision may rely on computed diagnostics or user-provided facts. Inspect Trace to see the evidence sufficiency check.</p>
      </section>
    );
  }

  return (
    <div className="tab-enter space-y-3">
      <section className="data-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-graphite">Retrieved evidence</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Playbook sources behind this decision</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">Sources are ordered by retrieval score. Open a card to inspect the exact chunk supplied to the decision workflow.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-graphite">{result.retrievedContext.length} chunks</span>
        </div>
      </section>

      {result.retrievedContext.map((context, index) => (
        <details key={`${context.source}-${index}`} className="data-card group overflow-hidden" open={index === 0 ? true : undefined}>
          <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-[22px] px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-graphite"><FileText size={16} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{context.source}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">retrieved_chunk_{String(index + 1).padStart(2, "0")}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">score {context.score.toFixed(2)}</span>
              <span className="text-graphite transition duration-200 group-open:rotate-90">›</span>
            </div>
          </summary>
          <div className="tab-enter border-t border-slate-100 px-4 py-4 sm:px-5">
            <p className="text-sm leading-7 text-graphite"><HighlightedSnippet text={context.snippet} /></p>
            <button
              type="button"
              onClick={() => void copyCitation(context.source, context.snippet)}
              className="focus-ring mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-graphite transition duration-150 hover:bg-white hover:text-ink"
            >
              {copyState?.source === context.source && copyState.status === "copied" ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              <span aria-live="polite">
                {copyState?.source === context.source ? (copyState.status === "copied" ? "Copied" : "Copy failed") : "Copy citation"}
              </span>
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}
