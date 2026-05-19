import { Brain, Database, FileSearch, GitBranch, LineChart, RefreshCcw, Route, ShieldCheck } from "lucide-react";

const steps = [
  {
    label: "1. Intake",
    description: "Question, optional CSV, and selected playbooks enter one bounded workflow state.",
    icon: Brain,
  },
  {
    label: "2. Agent planner",
    description: "Classify the task and build a structured plan: tools, retrieval scope, and retry policy.",
    icon: Route,
  },
  {
    label: "3. Corpus-scoped retrieval",
    description: "Search only selected playbook sources with hybrid keyword and vector-style scoring.",
    icon: FileSearch,
  },
  {
    label: "4. Evidence sufficiency check",
    description: "Check whether evidence is enough. If weak, broaden the retrieval query once and retry.",
    icon: GitBranch,
  },
  {
    label: "5. CSV diagnostics",
    description: "When CSV exists, run SRM, lift, significance, guardrail, and segment checks.",
    icon: LineChart,
  },
  {
    label: "6. Memo generation",
    description: "Generate a source-grounded launch memo with risks, uncertainty, and next actions.",
    icon: Database,
  },
  {
    label: "7. Policy validation",
    description: "Apply hard launch constraints so invalid or risky cases cannot become unsafe launches.",
    icon: ShieldCheck,
  },
  {
    label: "8. Evaluation loop",
    description: "Save traces, score RAG quality, inspect failures, and improve playbooks/retrieval.",
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
                <p className="text-sm font-semibold leading-5 text-ink">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-graphite">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-white/75 bg-white/54 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-graphite">Current mode</p>
        <p className="mt-2 text-sm leading-6 text-graphite">
          The UI proxies to FastAPI when the backend is running, then falls back to mock data only when the backend is
          unavailable.
        </p>
      </div>
    </section>
  );
}
