"use client";

import { useMemo } from "react";
import type { FaceScoreResult } from "@/types/face";

export default function MetricDebugPanel({ metrics }: { metrics: FaceScoreResult }) {
  const shouldShow = useMemo(() => {
    if (process.env.NODE_ENV !== "production") return true;
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);

  if (!shouldShow) return null;

  return (
    <details className="rounded-lg border border-line bg-ink/35 p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Metric debug</summary>
      <dl className="mt-3 grid gap-2 text-xs">
        {Object.entries(metrics.debugMetrics).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 border-b border-line/60 pb-1 last:border-0">
            <dt className="min-w-0 truncate text-slate-500">{key}</dt>
            <dd className="shrink-0 text-slate-200">{typeof value === "number" ? value.toFixed(3) : String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
