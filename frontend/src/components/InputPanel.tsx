"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, FileSpreadsheet, Loader2, Paperclip, ShieldCheck, UploadCloud, X } from "lucide-react";
import { corpora, examplePrompts } from "@/lib/mock-data";
import type { AnalysisResult } from "@/lib/types";
import { cn, formatFileSize } from "@/lib/utils";

type InputPanelProps = {
  onResult: (result: AnalysisResult) => void;
};

export function InputPanel({ onResult }: InputPanelProps) {
  const [question, setQuestion] = useState(examplePrompts[0]);
  const [file, setFile] = useState<File | null>(null);
  const [selectedCorpusIds, setSelectedCorpusIds] = useState<string[]>(corpora.map((corpus) => corpus.id));
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCount = selectedCorpusIds.length;
  const canSubmit = question.trim().length > 2 && selectedCorpusIds.length > 0 && !isLoading;

  const fileStatus = useMemo(() => {
    if (!file) return null;
    return `${file.name} · ${formatFileSize(file.size)} · ready`;
  }, [file]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) setFile(selected);
  }

  function toggleCorpus(id: string) {
    setSelectedCorpusIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("question", question);
      formData.append("selectedCorpusIds", JSON.stringify(selectedCorpusIds));
      if (file) formData.append("csvFile", file, file.name);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as AnalysisResult;
      onResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel liquid-edge rounded-[34px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-graphite">Analysis Request</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Ask the product analytics agent</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/62 px-3 py-2 text-xs font-semibold text-graphite shadow-sm">
          <ShieldCheck size={14} className="text-emerald-600" />
          {selectedCount} playbooks selected
        </div>
      </div>

      <div className="mt-5 rounded-[26px] border border-white/80 bg-white/66 p-3 shadow-sm">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={6}
          placeholder="Describe the experiment, the observed metric movement, and the decision you need."
          className="min-h-[156px] w-full resize-none rounded-[20px] border border-transparent bg-transparent px-3 py-2 text-[15px] leading-7 text-ink outline-none placeholder:text-slate-400 focus:border-blue-200 focus:bg-white/58"
        />
        <div className="flex flex-wrap gap-2 border-t border-line px-2 pt-3">
          {examplePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setQuestion(prompt)}
              className="rounded-full border border-slate-200 bg-white/72 px-3 py-2 text-xs font-medium text-graphite transition hover:border-slate-300 hover:bg-white hover:text-ink"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <section className="rounded-[26px] border border-white/80 bg-white/58 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">CSV diagnostics</p>
              <p className="mt-1 text-xs text-graphite">Optional A/B test observations or metric exports.</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-white shadow-soft transition hover:-translate-y-0.5"
            >
              <Paperclip size={17} />
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/56 p-4">
            {file ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    <FileSpreadsheet size={19} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
                    <p className="text-xs text-graphite">{fileStatus}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setFile(null)} className="rounded-full p-2 text-graphite hover:bg-slate-100 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 py-6 text-center text-graphite transition hover:text-ink"
              >
                <UploadCloud size={24} />
                <span className="text-sm font-semibold">Upload CSV</span>
                <span className="text-xs">SRM, lift, guardrails, and segment checks</span>
              </button>
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-white/80 bg-white/58 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Knowledge corpora</p>
              <p className="mt-1 text-xs text-graphite">Choose the playbooks the memo should follow.</p>
            </div>
            <button type="button" className="rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-graphite transition hover:bg-white hover:text-ink">
              Upload corpus
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {corpora.map((corpus) => {
              const selected = selectedCorpusIds.includes(corpus.id);
              return (
                <button
                  key={corpus.id}
                  type="button"
                  onClick={() => toggleCorpus(corpus.id)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    selected
                      ? "border-blue-200 bg-blueglass text-ink shadow-sm"
                      : "border-white/80 bg-white/52 text-graphite hover:bg-white/82",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-5">{corpus.name}</p>
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1", selected ? "bg-ink text-white ring-ink" : "bg-white text-transparent ring-slate-200")}>
                      <Check size={12} />
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-graphite">{corpus.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-graphite">
          Mock API mode: this UI is ready for the real EvalRAG FastAPI pipeline.
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
        >
          {isLoading ? <Loader2 className="animate-spin" size={17} /> : <ArrowUpRight size={17} />}
          {isLoading ? "Analyzing" : "Analyze Experiment"}
        </button>
      </div>
    </form>
  );
}
