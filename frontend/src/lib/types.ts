export type Recommendation =
  | "Launch"
  | "Do Not Launch"
  | "Launch with Guardrails"
  | "Needs More Investigation";

export type Corpus = {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  sources: string[];
  status: "ready" | "draft";
};

export type AnalysisHistoryItem = {
  id: string;
  title: string;
  timestamp: string;
  recommendation: Recommendation;
};

export type DiagnosticResult = {
  label: string;
  value: string;
  status: "pass" | "watch" | "risk";
};

export type EvaluationMetrics = {
  faithfulness: number;
  contextPrecision: number;
  answerRelevance: number;
  decisionConfidence: number;
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
  policyAction?: string;
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
  recommendation: Recommendation;
  summary: string;
  rawAnswer?: string;
  evidence: string[];
  risks: string[];
  uncertainty: string;
  nextActions: string[];
  retrievedContext: RetrievedContext[];
  diagnostics: DiagnosticResult[];
  evaluation: EvaluationMetrics;
  trace?: AnalysisTrace;
};

export type AnalyzeRequest = {
  question: string;
  selectedCorpusIds: string[];
  csvFileName?: string;
};
