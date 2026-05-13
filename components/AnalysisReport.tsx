"use client";

import { Download, FileJson, Info, ShieldCheck } from "lucide-react";
import MetricDebugPanel from "@/components/MetricDebugPanel";
import PhotoQualityWarnings from "@/components/PhotoQualityWarnings";
import { generateLooksReport } from "@/lib/reportGenerator";
import type { FaceAnalysis, FaceScoreResult } from "@/types/face";

type AnalysisReportProps = {
  analysis: FaceAnalysis | null;
  status: string;
};

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

function MetricRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-ink/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-sm font-semibold text-white">{value}</span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: FaceScoreResult }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
      <MetricRow label="Geometry" value={percent(metrics.geometryScore)} hint="Weighted symmetry, proportion, eye, nose-mouth, and lower-face score." />
      <MetricRow label="Symmetry" value={percent(metrics.symmetryScore)} hint="Mirrored landmark distances and paired feature balance." />
      <MetricRow label="Proportions" value={percent(metrics.proportionScore)} hint="Face shape, eye spacing, thirds, and nose-center bands." />
      <MetricRow label="Jaw/chin balance" value={percent(metrics.jawChinBalanceScore)} hint="Jaw width and chin centering estimate." />
      <MetricRow label="Eye-area balance" value={percent(metrics.eyeAreaBalanceScore)} hint="Eye width, openness, and symmetry estimate." />
      <MetricRow label="Nose/mouth proportionality" value={percent(metrics.noseMouthProportionalityScore)} hint="Nose width, mouth width, and centering estimate." />
      <MetricRow label="Photo quality" value={percent(metrics.photoQualityScore)} hint="Resolution, sharpness, lighting, crop, and centering." />
      <MetricRow label="Pose" value={percent(metrics.poseScore)} hint="Roll, yaw, and pitch proxies from landmarks." />
      <MetricRow label="Expression neutrality" value={percent(metrics.expressionNeutralityScore)} hint="Mouth openness and blendshape expression signals." />
      <MetricRow label="Landmark reliability" value={percent(metrics.landmarkConfidenceScore)} hint="Finite landmark and topology plausibility checks." />
    </div>
  );
}

export function exportReportJson(analysis: FaceAnalysis) {
  const report = generateLooksReport(analysis.metrics);
  const blob = new Blob([JSON.stringify({ report, analysis }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `facerate-report-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportCanvasPng() {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='face-canvas']");
  if (!canvas) return;
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `facerate-overlay-${new Date().toISOString().slice(0, 10)}.png`;
  link.click();
}

export default function AnalysisReport({ analysis, status }: AnalysisReportProps) {
  const report = analysis ? generateLooksReport(analysis.metrics) : null;
  const score = analysis?.metrics.finalAestheticBalanceScore ?? null;
  const confidence = analysis?.metrics.confidenceScore ?? null;
  const retakeRequired = analysis?.metrics.retakeRequired ?? false;

  return (
    <aside className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Aesthetic balance report</h2>
          <p className="text-xs text-slate-400">{status}</p>
        </div>
        <span className="rounded-md bg-mint/12 px-2.5 py-1 text-xs font-medium text-mint">Local</span>
      </div>

      <div className="space-y-5 p-4">
        <div className="rounded-lg border border-mint/25 bg-mint/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-mint">{report?.scoreLabel ?? "Aesthetic Balance Score"}</p>
              {retakeRequired ? (
                <p className="mt-2 text-2xl font-semibold leading-tight text-white">Retake photo for accurate rating</p>
              ) : (
                <p className="mt-2 text-4xl font-semibold text-white">{score ?? "--"}</p>
              )}
            </div>
            <ShieldCheck className="h-7 w-7 text-mint" />
          </div>
          <p className="mt-3 text-sm text-slate-300">
            {report?.summary ?? "Upload a photo to calculate approximate symmetry and proportion metrics."}
          </p>
        </div>

        {analysis ? (
          <>
            <div className="rounded-md border border-line bg-ink/35 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Confidence</span>
                <span className="text-sm font-semibold text-white">{Math.round(confidence ?? 0)} / 100</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Confidence reflects photo quality, pose, expression neutrality, and landmark reliability.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Metrics</h3>
                <span className="text-[11px] text-slate-500">{analysis.landmarks.length} landmarks</span>
              </div>
              <MetricsGrid metrics={analysis.metrics} />
            </div>

            <ReportList title="Strong points" items={report?.strongPoints ?? []} />
            <ReportList title="Areas that may be improved" items={report?.improvementAreas ?? []} />
            <ReportList title="Grooming and style suggestions" items={report?.groomingSuggestions ?? []} />

            <PhotoQualityWarnings warnings={analysis.metrics.warnings} />
            <MetricDebugPanel metrics={analysis.metrics} />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => exportReportJson(analysis)}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line bg-panelSoft px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-mint/60"
              >
                <FileJson className="h-4 w-4" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={exportCanvasPng}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line bg-panelSoft px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-mint/60"
              >
                <Download className="h-4 w-4" />
                Export PNG
              </button>
            </div>
          </>
        ) : null}

        <div className="rounded-lg border border-line bg-ink/45 p-3">
          <div className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <p className="text-xs leading-5 text-slate-400">
              {report?.disclaimer ?? "This is an experimental computer-vision estimate, not an objective measure of attractiveness."}{" "}
              {report?.privacyNote ??
                "Photos are processed locally in the browser and are not stored by FaceRate MVP."}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ReportList({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "warning" }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className={`rounded-md border px-3 py-2 text-sm leading-5 ${
              tone === "warning" ? "border-amber/30 bg-amber/10 text-amber" : "border-line bg-ink/35 text-slate-300"
            }`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
