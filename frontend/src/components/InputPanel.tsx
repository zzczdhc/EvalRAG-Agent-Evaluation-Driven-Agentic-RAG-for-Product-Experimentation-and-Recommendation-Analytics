"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowUp, Check, ChevronDown, FileSpreadsheet, Loader2, Paperclip, X } from "lucide-react";
import { corpora, examplePrompts } from "@/lib/mock-data";
import type { AnalysisErrorPayload, AnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/utils";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type InputPanelProps = {
  question: string;
  file: File | null;
  selectedCorpusIds: string[];
  isLoading: boolean;
  requestVersion: number;
  showExamples?: boolean;
  onQuestionChange: (question: string) => void;
  onFileChange: (file: File | null) => void;
  onToggleCorpus: (id: string) => void;
  onResult: (result: AnalysisResult) => void;
  onLoadingChange: (loading: boolean) => void;
  onQuestionSubmitted: (question: string, result: AnalysisResult, fileName?: string) => void;
  onError: (message: string | null) => void;
};

export function InputPanel({
  question,
  file,
  selectedCorpusIds,
  isLoading,
  requestVersion,
  showExamples = false,
  onQuestionChange,
  onFileChange,
  onToggleCorpus,
  onResult,
  onLoadingChange,
  onQuestionSubmitted,
  onError,
}: InputPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(requestVersion);

  useEffect(() => {
    requestVersionRef.current = requestVersion;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setFileError(null);
    setIsDragging(false);
  }, [requestVersion]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const hasQuestion = question.trim().length >= 3;
  const canSubmit = hasQuestion && selectedCorpusIds.length > 0 && !isLoading;
  const scopeLabel = selectedCorpusIds.includes("all-playbooks")
    ? "All playbooks"
    : `${selectedCorpusIds.length} focused scope${selectedCorpusIds.length === 1 ? "" : "s"}`;

  function acceptFile(candidate: File | null) {
    if (!candidate || isLoading) return;
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      setFileError("Only .csv experiment files are supported.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFileError("CSV must be 5 MB or smaller.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFileError(null);
    onFileChange(candidate);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  function clearFile() {
    onFileChange(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    if (!canSubmit) return;
    const submittedQuestion = question.trim();
    const submittedFileName = file?.name;
    const submittedVersion = requestVersionRef.current;
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;
    onError(null);
    onLoadingChange(true);
    try {
      const formData = new FormData();
      formData.append("question", submittedQuestion);
      formData.append("selectedCorpusIds", JSON.stringify(selectedCorpusIds));
      if (file) formData.append("csvFile", file, file.name);

      const response = await fetch("/api/analyze", { method: "POST", body: formData, signal: controller.signal });
      const payload = (await response.json()) as AnalysisResult | AnalysisErrorPayload;
      if (requestVersionRef.current !== submittedVersion) return;
      if (!response.ok || payload.mode === "error") {
        const errorPayload = payload as AnalysisErrorPayload;
        throw new Error(errorPayload.detail ? `${errorPayload.error} ${errorPayload.detail}` : errorPayload.error);
      }
      onResult(payload);
      onQuestionSubmitted(submittedQuestion, payload, submittedFileName);
    } catch (error) {
      if (controller.signal.aborted || requestVersionRef.current !== submittedVersion) return;
      onError(error instanceof Error ? error.message : "The live analysis could not be completed.");
    } finally {
      if (requestVersionRef.current === submittedVersion) onLoadingChange(false);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-shell rounded-[22px] p-4 sm:p-5" aria-busy={isLoading}>
      {showExamples ? (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-graphite">Try a real decision pattern</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examplePrompts.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => onQuestionChange(example.prompt)}
                className="focus-ring rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-graphite transition duration-200 hover:border-accent/25 hover:text-ink"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        onDragEnter={(event) => { event.preventDefault(); if (!isLoading) setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "rounded-[16px] border bg-white transition duration-200",
          isDragging ? "border-accent bg-blue-50/35 shadow-[0_0_0_3px_rgba(10,106,255,0.08)]" : "border-slate-200",
        )}
      >
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={showExamples ? 4 : 3}
          placeholder="Describe the experiment, the observed trade-off, and the decision you need to make…"
          aria-label="Experiment question"
          disabled={isLoading}
          className="max-h-[220px] min-h-[96px] w-full resize-none rounded-t-[16px] bg-transparent px-4 py-3 text-[15px] leading-7 text-ink outline-none placeholder:text-slate-400"
        />

        <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} disabled={isLoading} aria-describedby={fileError ? "csv-file-error" : undefined} />
            <button
              type="button"
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
              className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-graphite transition duration-200 hover:bg-white hover:text-ink"
            >
              <Paperclip size={14} />
              Attach CSV
            </button>
            {file ? (
              <div className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-800">
                <FileSpreadsheet size={14} className="shrink-0" />
                <span className="max-w-[220px] truncate">{file.name} · {formatFileSize(file.size)}</span>
                <button type="button" onClick={clearFile} disabled={isLoading} className="focus-ring rounded-md p-1 hover:bg-emerald-100 disabled:opacity-50" aria-label="Remove CSV">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">Drop a CSV for computed SRM, lift, and segment checks</span>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-blue-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <ArrowUp size={16} />}
            {isLoading ? "Analyzing" : "Analyze experiment"}
          </button>
        </div>
      </div>

      {fileError ? <p id="csv-file-error" role="alert" className="mt-2 text-xs font-medium text-danger">{fileError}</p> : null}

      <details className="mt-3 group">
        <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl px-2 text-xs font-medium text-graphite hover:bg-white/70">
          <span>Retrieval scope · <span className="text-ink">{scopeLabel}</span></span>
          <ChevronDown size={14} className="transition duration-200 group-open:rotate-180" />
        </summary>
        <div className="state-enter mt-2 grid gap-2 rounded-[14px] border border-slate-200 bg-white p-2 sm:grid-cols-2">
          {corpora.map((corpus) => {
            const selected = selectedCorpusIds.includes(corpus.id);
            return (
              <button
                key={corpus.id}
                type="button"
                disabled={isLoading}
                aria-pressed={selected}
                onClick={() => onToggleCorpus(corpus.id)}
                className={cn(
                  "focus-ring flex min-h-12 items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition duration-200",
                  selected ? "border-accent/25 bg-blue-50/70" : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white",
                )}
              >
                <span>
                  <span className="block text-xs font-semibold text-ink">{corpus.name}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-graphite">{corpus.description}</span>
                </span>
                <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", selected ? "border-accent bg-accent text-white" : "border-slate-300 text-transparent")}>
                  <Check size={11} />
                </span>
              </button>
            );
          })}
        </div>
      </details>
    </form>
  );
}
