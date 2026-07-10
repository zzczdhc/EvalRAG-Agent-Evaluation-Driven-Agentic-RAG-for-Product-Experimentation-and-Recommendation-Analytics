import { ArrowDown, ArrowRight, CheckCircle2, GitCompareArrows, ShieldCheck } from "lucide-react";
import { decisionMeta } from "@/lib/decisions";
import type { DecisionChain as DecisionChainData } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DecisionChain({ chain }: { chain: DecisionChainData }) {
  const draft = decisionMeta[chain.draftDecision];
  const final = decisionMeta[chain.finalDecision];
  const policyLabel = chain.policyAction === "override"
    ? "Overrode the draft"
    : chain.policyAction === "confirm"
      ? "Confirmed the draft"
      : "No hard rule triggered";

  return (
    <section className="data-card p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-graphite">Decision chain</p>
          <h3 className="mt-1 text-base font-semibold text-ink">How the recommendation was constrained</h3>
        </div>
        <span className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
          chain.policyAction === "override"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : chain.policyAction === "confirm"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-slate-50 text-graphite",
        )}>
          {chain.policyAction === "override" ? <GitCompareArrows size={12} /> : chain.policyAction === "confirm" ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}
          {policyLabel}
        </span>
      </div>

      <div className="mt-4 grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-[14px] border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Decision draft</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", draft.dot)} />
            <p className="text-sm font-semibold text-ink">{draft.label}</p>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-graphite">Bounded decision engine using computed and retrieved evidence.</p>
        </div>

        <div className="flex items-center justify-center text-slate-300">
          <ArrowRight size={17} className="hidden md:block" />
          <ArrowDown size={17} className="md:hidden" />
        </div>

        <div className="rounded-[14px] border border-blue-200 bg-blue-50/60 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-500">Policy check</p>
          <div className="mt-2 flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent" />
            <p className="text-sm font-semibold text-ink">{policyLabel}</p>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-graphite">{chain.findings.length} explicit finding{chain.findings.length === 1 ? "" : "s"} recorded.</p>
        </div>

        <div className="flex items-center justify-center text-slate-300">
          <ArrowRight size={17} className="hidden md:block" />
          <ArrowDown size={17} className="md:hidden" />
        </div>

        <div className={cn("rounded-[14px] border p-3.5", final.tone)}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-65">Final recommendation</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", final.dot)} />
            <p className="text-sm font-semibold">{final.label}</p>
          </div>
          <p className="mt-2 text-[11px] leading-4 opacity-75">This is the decision shown in the final memo.</p>
        </div>
      </div>

      {chain.findings.length ? (
        <div className="mt-3 space-y-2">
          {chain.findings.map((finding) => (
            <details key={`${finding.policyId}-${finding.recommendedDecision}`} className="group rounded-[14px] border border-slate-200 bg-white px-3.5 py-3">
              <summary className="focus-ring cursor-pointer list-none rounded-md text-sm font-medium text-ink">
                <span className="flex items-center justify-between gap-3">
                  <span>{finding.policyId.replace(/_/g, " ")}</span>
                  <span className="text-xs font-medium text-graphite transition duration-200 group-open:rotate-90">›</span>
                </span>
              </summary>
              <div className="tab-enter mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-graphite">
                <p>{finding.reason}</p>
                <p className="mt-2 font-mono text-[10px] text-slate-400">evidence: {finding.evidence}</p>
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
