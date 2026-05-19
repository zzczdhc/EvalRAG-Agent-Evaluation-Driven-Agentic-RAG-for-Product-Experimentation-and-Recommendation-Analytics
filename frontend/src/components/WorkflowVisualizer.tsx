import { ArrowRight, Brain, Database, FileSearch, GitBranch, LineChart, RefreshCcw, Route, WandSparkles } from "lucide-react";

const steps = [
  { label: "User Question", icon: Brain },
  { label: "Query Rewrite", icon: WandSparkles },
  { label: "Problem Router", icon: Route },
  { label: "Hybrid Retrieval", icon: FileSearch },
  { label: "Re-ranker", icon: GitBranch },
  { label: "CSV Diagnostics", icon: LineChart },
  { label: "Launch Memo", icon: Database },
  { label: "Evaluation Loop", icon: RefreshCcw },
];

export function WorkflowVisualizer() {
  return (
    <section className="glass-panel liquid-edge rounded-[28px] p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite">Controlled Agent Workflow</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Plan, retrieve, diagnose, evaluate</h2>
        </div>
        <span className="hidden rounded-full bg-blueglass px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 sm:inline-flex">
          bounded agent
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex items-center gap-2">
              <div className="min-h-[92px] flex-1 rounded-2xl border border-white/70 bg-white/58 p-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-ink text-white">
                  <Icon size={15} />
                </div>
                <p className="mt-3 text-sm font-semibold leading-5 text-ink">{step.label}</p>
              </div>
              {index < steps.length - 1 ? <ArrowRight className="hidden shrink-0 text-graphite xl:block" size={15} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
