import { BookOpen, FilePlus2, History, Plus, Sparkles } from "lucide-react";
import { corpora, historyItems } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const recommendationTone = {
  Launch: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Do Not Launch": "bg-rose-50 text-rose-700 ring-rose-200",
  "Launch with Guardrails": "bg-blue-50 text-blue-700 ring-blue-200",
  "Needs More Investigation": "bg-amber-50 text-amber-700 ring-amber-200",
};

export function Sidebar() {
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
          <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-black">
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
            {historyItems.map((item) => (
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
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-graphite">
              <BookOpen size={14} />
              Playbooks
            </div>
            <button className="rounded-full border border-white/80 bg-white/70 p-1.5 text-graphite shadow-sm transition hover:text-ink">
              <FilePlus2 size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {corpora.map((corpus) => (
              <div key={corpus.id} className="rounded-2xl border border-white/70 bg-white/48 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold leading-5 text-ink">{corpus.name}</h3>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                    {corpus.status}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-graphite">{corpus.description}</p>
                <p className="mt-2 text-[11px] font-medium text-graphite">{corpus.documentCount} docs</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
