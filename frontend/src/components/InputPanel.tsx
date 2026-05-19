"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { ArrowUp, FileSpreadsheet, Loader2, Paperclip, X } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { formatFileSize } from "@/lib/utils";

type InputPanelProps = {
  selectedCorpusIds: string[];
  onResult: (result: AnalysisResult) => void;
  onLoadingChange?: (loading: boolean) => void;
  onQuestionSubmitted?: (question: string, result: AnalysisResult) => void;
};

export function InputPanel({ selectedCorpusIds, onResult, onLoadingChange, onQuestionSubmitted }: InputPanelProps) {
  const [question, setQuestion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit = question.trim().length > 2 && selectedCorpusIds.length > 0 && !isLoading;
  const fileStatus = useMemo(() => (file ? `${file.name} · ${formatFileSize(file.size)}` : null), [file]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function submit() {
    if (!canSubmit) return;
    const submittedQuestion = question.trim();
    setIsLoading(true);
    onLoadingChange?.(true);
    try {
      const formData = new FormData();
      formData.append("question", submittedQuestion);
      formData.append("selectedCorpusIds", JSON.stringify(selectedCorpusIds));
      if (file) formData.append("csvFile", file, file.name);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as AnalysisResult;
      onResult(result);
      onQuestionSubmitted?.(submittedQuestion, result);
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel liquid-edge rounded-[34px] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite">Analysis Request</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Ask the product analytics agent</h2>
        </div>
        <p className="text-xs leading-5 text-graphite">
          {selectedCorpusIds.length} retrieval scopes active · {file ? "CSV attached" : "CSV optional"}
        </p>
      </div>

      <div className="mt-5 rounded-[26px] border border-white/80 bg-white/72 p-2.5 shadow-sm">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="Describe the experiment and ask for a launch recommendation..."
          className="max-h-[180px] min-h-[82px] w-full resize-none rounded-[20px] border border-transparent bg-transparent px-3 py-2 text-[15px] leading-7 text-ink outline-none placeholder:text-slate-400 focus:border-blue-100 focus:bg-white/50"
        />

        <div className="mt-1 flex items-center justify-between gap-3 border-t border-line px-1 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach CSV"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-white/78 text-graphite transition hover:bg-white hover:text-ink"
            >
              <Paperclip size={15} />
            </button>
            {file ? (
              <div className="flex min-w-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <FileSpreadsheet size={13} className="shrink-0" />
                <span className="truncate">{fileStatus}</span>
                <button type="button" onClick={() => setFile(null)} className="rounded-full p-0.5 hover:bg-emerald-100">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <span className="hidden text-xs text-graphite sm:inline">Attach CSV for SRM, lift, and segment diagnostics</span>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            title="Analyze experiment"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
          >
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <ArrowUp size={17} />}
          </button>
        </div>
      </div>
    </form>
  );
}
