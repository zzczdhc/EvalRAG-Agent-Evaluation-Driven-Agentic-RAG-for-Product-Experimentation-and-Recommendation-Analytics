import { Brain, Database, FileSearch, GitBranch, LineChart, RefreshCcw, Route, WandSparkles } from "lucide-react";

const steps = [
  {
    label: "User question",
    description: "Natural-language experiment or product analytics question.",
    icon: Brain,
  },
  {
    label: "Query rewrite",
    description: "Normalize the question into retrieval- and tool-friendly form.",
    icon: WandSparkles,
  },
  {
    label: "Problem router",
    description: "Classify whether the task is RAG-only, CSV analysis, or mixed.",
    icon: Route,
  },
  {
    label: "Hybrid retrieval",
    description: "Search playbooks with keyword and semantic-style scoring.",
    icon: FileSearch,
  },
  {
    label: "Re-ranker",
    description: "Prioritize the most useful supporting chunks before generation.",
    icon: GitBranch,
  },
  {
    label: "CSV diagnostics",
    description: "Run SRM, lift, guardrail, and segment checks when data exists.",
    icon: LineChart,
  },
  {
    label: "Launch memo",
    description: "Generate a structured recommendation with evidence and caveats.",
    icon: Database,
  },
  {
    label: "Evaluation loop",
    description: "Log traces, score outputs, inspect failures, then improve RAG.",
    icon: RefreshCcw,
  },
];

export function WorkflowVisualizer() {
  return (
    <section className="glass-panel liquid-edge rounded-[28px] p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite">Controlled Agent Workflow</p>
          <h2 className="mt-2 text-xl font-semibold leading-tight text-ink">Plan, retrieve, diagnose, evaluate</h2>
        </div>
        <span className="shrink-0 rounded-full bg-blueglass px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
          bounded agent
        </span>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="relative flex gap-3">
              {index < steps.length - 1 ? (
                <span className="absolute left-[17px] top-10 h-[calc(100%-18px)] w-px bg-slate-200" />
              ) : null}
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-ink text-white shadow-sm">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1 rounded-2xl border border-white/75 bg-white/58 px-3 py-3 shadow-sm transition hover:bg-white/82">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold leading-5 text-ink">{step.label}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-graphite ring-1 ring-slate-200">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-graphite">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-white/75 bg-white/54 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-graphite">Current mode</p>
        <p className="mt-2 text-sm leading-6 text-graphite">
          The UI is live, but the analysis response is currently mocked. The real backend can be connected through the
          Next.js API route without redesigning this interface.
        </p>
      </div>
    </section>
  );
}
