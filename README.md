# EvalRAG Agent

Evaluation-driven agentic RAG for product experimentation analytics.

EvalRAG Agent turns product experimentation questions and synthetic A/B test CSVs into structured, source-grounded launch memos. It retrieves from a product experimentation playbook, optionally runs statistical tools, generates a decision memo with an OpenAI-compatible LLM, validates the decision against explicit policy constraints, logs the trace, and evaluates the result with both custom metrics and Ragas.

The project goal is not to build a generic document chatbot. The goal is to demonstrate an inspectable experimentation analyst workflow where retrieval, reasoning, policy checks, and answer quality can be measured and improved.

## Core Idea

A general-purpose LLM can often produce a plausible answer to a question like:

```text
Revenue increased, but retention dropped. Should we launch?
```

That is not enough for product experimentation work. The system should answer using a defined playbook, explicit experiment evidence, and auditable decision rules. It should also expose failures:

- Did retrieval find the relevant playbook sections?
- Did the answer rely on retrieved context and scenario facts?
- Did the system call the right statistical tools for CSV-based analysis?
- Did the LLM decision, policy decision, and final decision agree?
- Did evaluation metrics improve after a playbook, chunking, retrieval, or prompt change?

EvalRAG follows this loop:

```text
Build -> Log -> Evaluate -> Diagnose -> Improve -> Re-run
```

## System Flow

```text
User input: question and optional CSV
        |
        v
Agent controller
        |
        +--> Task router
        |    Decide whether the request is knowledge-only, CSV analysis, or mixed.
        |
        +--> Agent planner
        |    Build a bounded plan: task type, retrieval scope, allowed tools, and retry policy.
        |
        +--> Evidence collection
        |    Retrieve playbook chunks and optionally run CSV diagnostics.
        |
        +--> Evidence sufficiency check
        |    If evidence is weak, broaden the retrieval query and retry once before generation.
        |
        +--> LLM launch memo
        |    Generate a structured recommendation using the collected evidence.
        |
        +--> Policy guardrails
        |    Apply hard constraints such as SRM failure, guardrail regression, and non-random rollout.
        |
        v
Final memo + trace log + evaluation metrics
```

| Stage | Responsibility | Current status |
| --- | --- | --- |
| Task router | Classify the user request and decide whether CSV tools are needed. | Bounded rule-based router. |
| Agent planner | Select allowed tools, retrieval scope, retry policy, and decision guardrails. | Explicit structured `agent_plan` in the trace. |
| Retrieval | Search selected playbooks for relevant experimentation guidance. | Corpus-scoped hybrid BM25 + vector-style retrieval. |
| CSV diagnostics | Compute experiment facts such as SRM, lift, guardrail movement, and segment risk. | Deterministic statistical tools. |
| Evidence sufficiency | Decide whether retrieved/contextual evidence is enough to answer safely. | Implemented with traceable reasons and one retrieval retry path. |
| Memo generation | Produce the launch recommendation memo. | OpenAI-compatible LLM. |
| Policy validation | Block unsafe launch decisions under explicit hard constraints. | Deterministic policy validator. |
| Evaluation loop | Measure retrieval quality, answer quality, policy corrections, and failure modes. | Custom eval + Ragas + failure inspection. |

EvalRAG is designed as a bounded product analytics agent. The agent does not freely execute arbitrary actions. Instead, it operates inside a controlled workflow: classify the task, decide whether data tools are needed, retrieve playbook evidence, check whether evidence is sufficient, generate a launch memo, validate the decision, log the trace, and evaluate the result.

In the current implementation:

- task routing and agent planning are bounded and traceable;
- CSV analysis is handled by deterministic statistical tools;
- playbook lookup is handled by corpus-scoped hybrid retrieval;
- memo generation and the proposed decision are handled by the LLM;
- final decision safety is checked by the policy validator;
- quality is measured by custom eval, Ragas, and failure inspection.

The near-term agent upgrade is to make the controller more adaptive while keeping the workflow bounded: the LLM can produce the structured plan, but it should still choose only from allowed tools, inspect retrieved evidence, retry retrieval when evidence is weak, verify user claims against CSV outputs, and ask for missing information when the available evidence is insufficient.

That distinction is intentional. Product launch analysis should not be a fully open-ended autonomous agent. It should be an auditable agentic workflow with constrained tools, explicit evidence, deterministic guardrails, and measurable failure modes.

## What This Project Demonstrates

- Domain-specific RAG over a product experimentation playbook.
- Hybrid retrieval using BM25 plus dependency-light vector scoring.
- A LangGraph analyst workflow with explicit state transitions.
- A bounded agent plan recorded in each trace, including selected corpora, planned tools, and evidence retry policy.
- OpenAI-compatible LLM generation with parseable decision labels.
- Local Ollama fallback support for development.
- Statistical tools for synthetic experiment CSVs: SRM, metric lift, approximate tests, and segment analysis.
- Policy validation for hard experimentation constraints such as SRM failure, guardrail regression, non-random rollout, and segment harm.
- Trace logging for question, retrieved chunks, scores, tool outputs, decisions, latency, model, and backend.
- Frontend trace/debug view for workflow steps, retrieval scope, evidence checks, and raw backend markdown.
- Custom evaluation for retrieval quality, concept coverage, decision accuracy, policy corrections, and latency.
- Ragas evaluation for faithfulness, answer relevancy, context precision, context recall, and answer correctness.
- Failure inspection reports that join Ragas scores with the actual question, answer, reference, expected sources, and retrieved chunks.

## Decision Labels

EvalRAG uses a constrained decision vocabulary:

- `launch`
- `do_not_launch`
- `investigate_further`
- `partial_rollout`
- `do_not_trust_result`
- `use_did_or_quasi_experiment`

The LLM proposes a decision, the policy validator checks it, and the final memo records the resulting decision trace.

## Example Scenarios

EvalRAG is designed for product experimentation questions such as:

- Revenue improved, but 7-day retention declined.
- CTR increased, but conversion quality or purchase conversion dropped.
- Treatment/control split shows sample ratio mismatch.
- A feature wins overall but harms high-value users or a strategic segment.
- A marketplace ranking model concentrates exposure and may harm supply health.
- A rollout was non-randomized and should use DiD or another quasi-experimental design.
- A CSV experiment needs SRM checks, lift calculations, significance checks, and segment summaries before launch.

## Repository Layout

```text
app/
  main.py                    FastAPI app
  rag_pipeline.py            Pipeline interface over the graph workflow
  config.py                  Environment-based settings
  graph/
    state.py                 Shared graph state schema
    nodes.py                 Graph node implementations
    workflow.py              LangGraph workflow definition and routing
  policy_validator.py        Hard-constraint policy validation
  llm_generator.py           OpenAI-compatible generation and prompt builder
  retrieval.py               BM25 + vector hybrid retrieval
  chunking.py                Markdown playbook chunking and index persistence
  telemetry.py               JSONL logging
  tools/
    experiment_stats.py      SRM, lifts, tests, segment analysis
    data_validation.py       CSV validation and metric inference

data/
  playbook/                  Product experimentation playbook files
  eval/eval_questions.jsonl  Golden/scenario evaluation set
  synthetic/                 Synthetic experiment CSV scenarios

scripts/
  build_index.py             Rebuild playbook chunk index
  query.py                   Ask one question from CLI
  analyze_csv.py             Analyze one CSV with tools + RAG
  run_eval.py                Run custom scenario evaluation
  run_ragas_eval.py          Run Ragas metrics over saved eval records
  inspect_ragas_failures.py  Join Ragas failures with answers and retrieved chunks
  compare_retrievers.py      Compare retrieval settings without LLM calls
  generate_synthetic_data.py Generate synthetic CSV scenarios

docs/
  HOSTED_OPENAI_API.md       Hosted OpenAI setup
  LOCAL_LLM.md               Ollama / LM Studio setup
  DECISION_EVALUATION.md     LLM, policy, and final decision tracing
  EVALUATION_DRIVEN_RAG.md   Eval loop, Ragas, failure analysis, LangSmith notes

logs/                        Runtime logs and eval outputs, ignored by git
tests/                       Unit tests
```

## Setup

```bash
cd /Users/alex_z/Documents/EvalRAG-Agent
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/build_index.py
```

Set your hosted API key in the shell:

```bash
export OPENAI_API_KEY="your_api_key_here"
```

Do not commit real API keys or paste them into screenshots.

## Quick Start

Ask one question:

```bash
python scripts/query.py "Revenue increased but 7-day retention dropped. Should we launch?" --show-metadata
```

Analyze a synthetic CSV:

```bash
python scripts/analyze_csv.py data/synthetic/guardrail_failure.csv --show-tools
```

Run the FastAPI app:

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/docs
```

## Frontend UI

The product UI lives in:

```text
frontend/
```

It is a Next.js + Tailwind interface for an AI product analytics decision-support agent. The UI includes a ChatGPT-like sidebar, playbook selection, CSV upload affordance, structured launch memo output, diagnostics, retrieved context, evaluation metrics, and a compact controlled-agent workflow visualization.

Run it locally:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

To run the full local product loop, start both services:

```bash
# terminal 1: Python backend
uvicorn app.main:app --reload

# terminal 2: Next.js frontend
cd frontend
npm run dev
```

The frontend proxies analysis requests through:

```text
frontend/src/app/api/analyze/route.ts
```

Current frontend/backend status:

- question-only requests call FastAPI `POST /ask` when the backend is running;
- CSV-backed requests call FastAPI `POST /analyze` with multipart form data;
- FastAPI responses are mapped into the frontend `AnalysisResult` shape;
- if the Python backend is unavailable, the UI falls back to mock data so frontend development still works;
- Playbook/corpus selection is forwarded to FastAPI and limits retrieval to the mapped playbook source files;
- the result panel exposes an agent trace with planner output, retrieval scope, evidence sufficiency reasons, policy action, workflow steps, and raw backend markdown.

The backend URL defaults to:

```text
http://127.0.0.1:8000
```

Override it with:

```bash
EVALRAG_BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

The current mapping is:

- no CSV: call FastAPI `POST /ask` with the question;
- CSV present: call FastAPI `POST /analyze` with multipart form data;
- map FastAPI fields such as `answer`, `decision`, `retrieved_chunks`, `tool_summary`, `policy_validation`, `evaluation`, and `trace` into the frontend `AnalysisResult` type.

## LLM Configuration

Primary hosted model defaults:

```text
EVALRAG_GENERATOR=openai_compatible
EVALRAG_LLM_BASE_URL=https://api.openai.com/v1
EVALRAG_LLM_MODEL=gpt-5.4-mini
EVALRAG_LLM_TOKEN_PARAMETER=max_completion_tokens
```

Optional local fallback defaults:

```text
EVALRAG_LLM_FALLBACK_ENABLED=true
EVALRAG_FALLBACK_LLM_BASE_URL=http://localhost:11434/v1
EVALRAG_FALLBACK_LLM_MODEL=qwen3:8b
EVALRAG_FALLBACK_LLM_TOKEN_PARAMETER=max_tokens
```

If the hosted call fails and local fallback is available, metadata records `generator_backend: local_llm_fallback`. For evaluation runs intended to compare model quality, confirm the saved records show `generator_backend: openai_compatible` and no `generator_error`.

See:

- `docs/HOSTED_OPENAI_API.md`
- `docs/LOCAL_LLM.md`
- `docs/DECISION_EVALUATION.md`
- `docs/EVALUATION_DRIVEN_RAG.md`

## Evaluation Workflow

The evaluation set is stored in:

```text
data/eval/eval_questions.jsonl
```

Each row can include:

- `question`: scenario prompt
- `expected_sources`: playbook files expected in retrieval
- `expected_concepts`: concepts expected in the answer
- `expected_decision`: expected final decision label
- optional reference/ground-truth fields for deeper judge evaluation

### 1. Rebuild Index After Playbook Edits

```bash
python scripts/build_index.py
```

### 2. Run Custom Eval

```bash
python scripts/run_eval.py --save-records logs/openai_eval_full.json
```

This records retrieval traces, generated answers, decision labels, policy validation, and custom metrics.

Retrieval-only mode avoids LLM cost:

```bash
python scripts/run_eval.py --retrieval-only
```

Strict concept judging can be enabled for missing concepts:

```bash
python scripts/run_eval.py --concept-judge --save-records logs/openai_eval_judge_full.json
```

### 3. Run Ragas Eval

```bash
python scripts/run_ragas_eval.py \
  --records logs/openai_eval_full.json \
  --output logs/ragas_eval_full.json \
  --csv-output logs/ragas_eval_full.csv \
  --ragas-model gpt-5.4-mini
```

Prepare the Ragas dataset without judge calls:

```bash
python scripts/run_ragas_eval.py \
  --records logs/openai_eval_full.json \
  --prepare-only \
  --output logs/ragas_input_full.json
```

### 4. Inspect Failure Cases

```bash
python scripts/inspect_ragas_failures.py \
  --records logs/openai_eval_full.json \
  --ragas-report logs/ragas_eval_full.json \
  --output logs/failure_analysis_full.md
```

The report groups failures by hypothesis and decision category, then prints each case with:

- question
- Ragas weak metrics
- expected and matched sources
- answer preview
- reference text
- retrieved chunk previews
- a likely diagnosis

### 5. Compare Retrieval Settings

```bash
python scripts/compare_retrievers.py
```

You can also run controlled experiments by changing `--top-k`:

```bash
python scripts/run_eval.py --top-k 8 --save-records logs/openai_eval_top8.json
```

Then rerun Ragas and compare metric deltas.

## Metrics

Custom retrieval metrics:

- `source_hit_at_k`: at least one expected source appears in top-k
- `source_match_rate`: fraction of expected sources retrieved
- `all_expected_sources_found_rate`: whether all expected sources are found
- `top1_source_match_rate`: whether the top source is expected
- `source_precision_at_k`: fraction of retrieved sources that are expected
- `mean_reciprocal_rank`: how early the first expected source appears

Custom answer and decision metrics:

- `concept_coverage`
- `deterministic_concept_coverage`
- `llm_decision_accuracy`
- `policy_decision_accuracy_when_triggered`
- `final_decision_accuracy`
- `policy_correction_rate`
- `policy_regression_rate`
- `avg_latency_seconds`

Ragas metrics:

- `faithfulness`: whether the answer is supported by retrieved contexts
- `answer_relevancy`: whether the answer directly addresses the question
- `context_precision`: whether retrieved contexts are useful and well ranked
- `context_recall`: whether retrieved contexts cover the reference answer
- `answer_correctness`: whether the answer matches the reference answer

Important caveat: product experimentation memos often combine user-provided scenario facts with retrieved playbook guidance. Ragas is useful as a general RAG health check, but low scores should be inspected case by case before treating them as system failures.

## Example Output Shape

```markdown
## Short Answer

## Decision Recommendation
`investigate_further`

## Reasoning

## Metrics to Check

## Suggested Next Steps

## Risks / Caveats

## Policy Validation

## Retrieved Sources
```

Internally, each run also records structured fields such as:

- `task_type`
- `agent_plan`
- `required_tools`
- `tool_summary`
- `evidence_bundle`
- `evidence_check`
- `evidence_sufficiency`
- `trace_steps`
- `decision_json`
- `policy_validation`
- `llm_decision`
- `policy_decision`
- `final_decision`

## Engineering Boundaries

EvalRAG is designed as a rigorous applied AI project, not as production experimentation infrastructure. Current boundaries are explicit:

- The playbook is domain-authored and should keep improving as the evaluation set grows.
- The policy validator is deterministic and conservative; future versions can externalize policy rules into a configurable policy layer.
- Statistical tools are lightweight and intended for synthetic or portfolio-scale examples.
- Retrieval uses dependency-light local indexing rather than a managed vector database or production reranker.
- Ragas metrics require careful interpretation because launch memos are judgment tasks, not pure extractive QA.
- LangSmith is optional; local JSON logs and reports are sufficient for the current evaluation loop.

## Project Identity

EvalRAG Agent is an evaluation-driven experimentation analyst workflow. It combines retrieval, statistical tools, structured LLM output, policy validation, telemetry, and failure analysis to make AI-assisted product launch recommendations measurable and debuggable.
