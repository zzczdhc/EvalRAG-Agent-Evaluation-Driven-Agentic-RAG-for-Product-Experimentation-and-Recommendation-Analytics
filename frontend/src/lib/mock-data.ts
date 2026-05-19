import type { AnalysisHistoryItem, AnalysisResult, Corpus } from "./types";

export const corpora: Corpus[] = [
  {
    id: "product-experimentation",
    name: "Product Experimentation Playbook",
    description: "A/B testing, primary metrics, trade-offs, and launch readiness.",
    documentCount: 10,
    status: "ready",
  },
  {
    id: "guardrails",
    name: "Guardrail Metrics Guidelines",
    description: "Retention, complaint rate, unsubscribe, and long-term product health.",
    documentCount: 6,
    status: "ready",
  },
  {
    id: "srm-validity",
    name: "SRM & Experiment Validity Notes",
    description: "Randomization, logging, exposure, eligibility, and validity checks.",
    documentCount: 5,
    status: "ready",
  },
  {
    id: "launch-rubric",
    name: "Launch Decision Rubric",
    description: "Launch, hold, partial rollout, and investigation decision framework.",
    documentCount: 4,
    status: "ready",
  },
];

export const historyItems: AnalysisHistoryItem[] = [
  {
    id: "a-1024",
    title: "Revenue up, retention down",
    timestamp: "Today",
    recommendation: "Needs More Investigation",
  },
  {
    id: "a-1023",
    title: "SRM risk in feed ranking test",
    timestamp: "Yesterday",
    recommendation: "Do Not Launch",
  },
  {
    id: "a-1022",
    title: "Marketplace segment harm",
    timestamp: "Apr 30",
    recommendation: "Launch with Guardrails",
  },
];

export const examplePrompts = [
  "Primary metric increased but retention dropped. Should we launch?",
  "Check whether this experiment has SRM risk.",
  "Summarize the metric trade-off and recommend next steps.",
  "Analyze segment-level risk from this CSV.",
];

export const mockResult: AnalysisResult = {
  recommendation: "Launch with Guardrails",
  summary:
    "The treatment shows encouraging primary metric movement, but the decision should remain guarded until retention and segment-level risks are verified against the experiment data.",
  rawAnswer:
    "## Short Answer\nMock response. Start FastAPI to view the real EvalRAG markdown memo.\n\n## Decision Recommendation\n`partial_rollout`\n",
  evidence: [
    "Primary metric appears directionally positive based on the user scenario.",
    "Guardrail guidance requires checking retention, complaint rate, and segment concentration before a full rollout.",
    "The selected playbooks support partial rollout when gains are concentrated or guardrails move negatively.",
  ],
  risks: [
    "Short-term engagement or revenue may be masking long-term user value loss.",
    "A high-value segment could be harmed even if the aggregate result is positive.",
    "SRM or logging issues would invalidate causal interpretation of the measured lift.",
  ],
  uncertainty:
    "The current UI response is mocked. A production response should use retrieved chunks, CSV diagnostics, confidence intervals, and policy validation from the EvalRAG backend.",
  nextActions: [
    "Run SRM and exposure validity checks before interpreting lift.",
    "Estimate lift and confidence intervals for primary and guardrail metrics.",
    "Inspect segment-level effects for new users, returning users, device, country, and high-value cohorts.",
    "Consider a partial rollout only for segments where guardrails remain stable.",
  ],
  retrievedContext: [
    {
      source: "launch_decision.md",
      snippet:
        "A full launch should require primary metric improvement, stable guardrails, and no unresolved validity issues.",
      score: 0.91,
    },
    {
      source: "guardrail_metrics.md",
      snippet:
        "Do not treat revenue or CTR gains as sufficient if retention, complaints, or long-term health worsen.",
      score: 0.88,
    },
    {
      source: "segment_analysis.md",
      snippet:
        "Aggregate wins can hide harm to important user segments; check concentration before launch.",
      score: 0.84,
    },
  ],
  diagnostics: [
    { label: "Metric difference", value: "+4.8%", status: "pass" },
    { label: "Uplift", value: "+5.1%", status: "pass" },
    { label: "P-value / CI", value: "pending", status: "watch" },
    { label: "Guardrail movement", value: "retention watch", status: "risk" },
    { label: "Segment checks", value: "not complete", status: "watch" },
  ],
  evaluation: {
    faithfulness: 0.86,
    contextPrecision: 0.91,
    answerRelevance: 0.88,
    decisionConfidence: 0.78,
  },
  trace: {
    queryId: "mock-query",
    taskType: "guardrail_regression",
    requiredTools: ["retrieve_playbook_rules", "check_policy_constraints"],
    selectedCorpusIds: ["product-experimentation", "guardrails"],
    selectedSources: ["launch_decision.md", "guardrail_metrics.md", "segment_analysis.md"],
    evidenceSufficiency: "mocked",
    evidenceReasons: ["FastAPI backend was unavailable, so the frontend returned mock trace data."],
    topRetrievalScore: 0.91,
    policyAction: "mock",
    generatorBackend: "mock_frontend",
    model: "mock",
    steps: [
      {
        step: "frontend_fallback",
        status: "mocked",
        details: {
          reason: "Connect FastAPI to view real workflow traces.",
        },
      },
    ],
  },
};
