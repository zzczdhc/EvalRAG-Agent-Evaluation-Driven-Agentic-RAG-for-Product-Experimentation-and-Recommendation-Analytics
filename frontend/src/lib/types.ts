export type DecisionCode =
  | "launch"
  | "do_not_launch"
  | "partial_rollout"
  | "investigate_further"
  | "do_not_trust_result"
  | "use_did_or_quasi_experiment";

export type AnalysisMode = "live" | "demo";

export type Corpus = {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  sources: string[];
  status: "ready" | "draft";
};

export type PolicyFinding = {
  policyId: string;
  recommendedDecision: DecisionCode;
  reason: string;
  evidence: string;
  severity?: string;
};

export type DecisionChain = {
  draftDecision: DecisionCode;
  policyDecision: DecisionCode | null;
  finalDecision: DecisionCode;
  policyAction: "override" | "confirm" | "none";
  findings: PolicyFinding[];
};

export type ValidationSummary = {
  valid: boolean;
  rowCount: number | null;
  columns: string[];
  errors: string[];
  warnings: string[];
  groupCounts: Record<string, number>;
};

export type SrmSummary = {
  classification: "pass" | "fail" | "not_run";
  controlN: number | null;
  treatmentN: number | null;
  pValue: number | null;
  alpha: number | null;
  reason?: string;
};

export type MetricDiagnostic = {
  metric: string;
  controlMean: number | null;
  treatmentMean: number | null;
  absoluteLift: number | null;
  liftPct: number | null;
  ciLower: number | null;
  ciUpper: number | null;
  pValue: number | null;
  riskFlag: boolean;
  status: "positive" | "neutral" | "risk";
};

export type SegmentDiagnostic = MetricDiagnostic & {
  segment: string;
};

export type EvaluationMetrics = {
  faithfulness: number | null;
  contextPrecision: number | null;
  answerRelevance: number | null;
  decisionConfidence: number | null;
};

export type AnalysisTrace = {
  queryId?: string;
  taskType?: string;
  agentPlan?: Record<string, unknown>;
  requiredTools?: string[];
  selectedCorpusIds?: string[];
  selectedSources?: string[];
  evidenceSufficiency?: string;
  evidenceReasons?: string[];
  topRetrievalScore?: number;
  generatorBackend?: string;
  model?: string;
  steps?: Array<{
    step: string;
    status: string;
    details?: Record<string, unknown>;
  }>;
};

export type RetrievedContext = {
  source: string;
  snippet: string;
  score: number;
};

export type AnalysisResult = {
  mode: AnalysisMode;
  decision: DecisionCode;
  summary: string;
  rawAnswer?: string;
  evidence: string[];
  risks: string[];
  uncertainty: string;
  nextActions: string[];
  retrievedContext: RetrievedContext[];
  validation: ValidationSummary | null;
  srm: SrmSummary | null;
  metrics: MetricDiagnostic[];
  segments: SegmentDiagnostic[];
  evaluation: EvaluationMetrics;
  decisionChain: DecisionChain;
  trace?: AnalysisTrace;
  latencySeconds: number | null;
  model?: string;
};

export type AnalysisHistoryItem = {
  id: string;
  question: string;
  timestamp: string;
  result: AnalysisResult;
  fileName?: string;
};

export type AnalysisErrorPayload = {
  mode: "error";
  error: string;
  detail?: string;
};
