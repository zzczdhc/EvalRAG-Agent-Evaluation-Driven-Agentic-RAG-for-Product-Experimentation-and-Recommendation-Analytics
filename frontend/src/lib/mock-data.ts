import type { Corpus } from "./types";

export const corpora: Corpus[] = [
  {
    id: "all-playbooks",
    name: "All playbooks",
    description: "Search the complete product experimentation knowledge base.",
    documentCount: 10,
    sources: [
      "ab_testing.md",
      "ads_experiments.md",
      "did_policy_analysis.md",
      "experiment_telemetry.md",
      "guardrail_metrics.md",
      "launch_decision.md",
      "marketplace_metrics.md",
      "recommendation_experiments.md",
      "sample_ratio_mismatch.md",
      "segment_analysis.md",
    ],
    status: "ready",
  },
  {
    id: "product-experimentation",
    name: "Experimentation",
    description: "Primary metrics, trade-offs, and launch readiness.",
    documentCount: 4,
    sources: ["ab_testing.md", "experiment_telemetry.md", "launch_decision.md", "recommendation_experiments.md"],
    status: "ready",
  },
  {
    id: "guardrails",
    name: "Guardrails",
    description: "Retention, complaints, and long-term product health.",
    documentCount: 4,
    sources: ["guardrail_metrics.md", "marketplace_metrics.md", "recommendation_experiments.md", "ads_experiments.md"],
    status: "ready",
  },
  {
    id: "srm-validity",
    name: "Validity & SRM",
    description: "Randomization, exposure, eligibility, and logging validity.",
    documentCount: 3,
    sources: ["sample_ratio_mismatch.md", "ab_testing.md", "experiment_telemetry.md"],
    status: "ready",
  },
  {
    id: "launch-rubric",
    name: "Launch rubric",
    description: "Launch, hold, partial rollout, and investigation rules.",
    documentCount: 4,
    sources: ["launch_decision.md", "segment_analysis.md", "did_policy_analysis.md", "guardrail_metrics.md"],
    status: "ready",
  },
];

export const examplePrompts = [
  {
    label: "Retention regression",
    prompt: "Revenue increased, but 7-day retention declined. Should this experiment ship?",
  },
  {
    label: "SRM check",
    prompt: "The planned 50/50 split is materially imbalanced. Can we trust this result?",
  },
  {
    label: "Segment harm",
    prompt: "The aggregate metric improved, but high-value users were harmed. What rollout is defensible?",
  },
];
