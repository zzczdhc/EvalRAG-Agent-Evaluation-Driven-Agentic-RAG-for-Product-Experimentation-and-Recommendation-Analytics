"use client";

import { useState } from "react";
import { Activity, DatabaseZap, ShieldCheck } from "lucide-react";
import { InputPanel } from "@/components/InputPanel";
import { ResultMemo } from "@/components/ResultMemo";
import { Sidebar } from "@/components/Sidebar";
import { WorkflowVisualizer } from "@/components/WorkflowVisualizer";
import type { AnalysisResult } from "@/lib/types";

export function AnalyticsWorkspace() {
  const [result, setResult] = useState<AnalysisResult | null>(null);

  return (
    <main className="min-h-screen text-ink">
      <div className="flex min-h-screen">
        <Sidebar />
        <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
            <header className="glass-panel liquid-edge rounded-[34px] px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="max-w-3xl">
                  <div className="mb-3 inline-flex rounded-full border border-white/80 bg-white/58 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-graphite shadow-sm">
                    Evaluation-driven agentic RAG
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
                    Product experiment decisions, grounded in evidence.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-graphite sm:text-base">
                    EvalRAG helps product data scientists turn experiment questions, CSV diagnostics, and playbook
                    evidence into auditable launch recommendation memos.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:w-[520px]">
                  <div className="rounded-[24px] border border-white/80 bg-white/58 p-4 shadow-sm">
                    <Activity className="text-blue-600" size={19} />
                    <p className="mt-3 text-2xl font-semibold text-ink">25</p>
                    <p className="text-xs text-graphite">eval cases</p>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/58 p-4 shadow-sm">
                    <DatabaseZap className="text-violet-600" size={19} />
                    <p className="mt-3 text-2xl font-semibold text-ink">Hybrid</p>
                    <p className="text-xs text-graphite">retrieval</p>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/58 p-4 shadow-sm">
                    <ShieldCheck className="text-emerald-600" size={19} />
                    <p className="mt-3 text-2xl font-semibold text-ink">Policy</p>
                    <p className="text-xs text-graphite">guardrails</p>
                  </div>
                </div>
              </div>
            </header>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <InputPanel onResult={setResult} />
                <ResultMemo result={result} />
              </div>
              <aside className="space-y-5">
                <WorkflowVisualizer />
                <section className="glass-panel liquid-edge rounded-[28px] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite">Integration notes</p>
                  <h2 className="mt-2 text-lg font-semibold text-ink">Backend contract</h2>
                  <p className="mt-3 text-sm leading-7 text-graphite">
                    The current UI calls a mocked Next.js route at <span className="font-mono text-ink">/api/analyze</span>.
                    Replace that route with calls into the FastAPI <span className="font-mono text-ink">/ask</span> and
                    <span className="font-mono text-ink"> /analyze</span> endpoints when wiring the real pipeline.
                  </p>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
