import type { DecisionCode } from "./types";

export const decisionMeta: Record<DecisionCode, { label: string; compact: string; tone: string; dot: string }> = {
  launch: {
    label: "Launch",
    compact: "Launch",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-success",
  },
  do_not_launch: {
    label: "Do not launch",
    compact: "Block",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-danger",
  },
  partial_rollout: {
    label: "Partial rollout",
    compact: "Partial",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-accent",
  },
  investigate_further: {
    label: "Investigate further",
    compact: "Investigate",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-caution",
  },
  do_not_trust_result: {
    label: "Do not trust result",
    compact: "Invalid",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-danger",
  },
  use_did_or_quasi_experiment: {
    label: "Use quasi-experimental design",
    compact: "Use DiD",
    tone: "border-violet-200 bg-violet-50 text-violet-800",
    dot: "bg-violet-600",
  },
};

export function formatMetricName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatNumber(value: number | null, digits = 3) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatPercent(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
