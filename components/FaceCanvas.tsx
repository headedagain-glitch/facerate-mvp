"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  FACE_LANDMARK_GROUPS,
  buildMeasurementLines,
  detectFace,
  mapLandmarkToPixel,
} from "@/lib/faceLandmarks";
import { calculateFaceMetrics } from "@/lib/metrics";
import type { FaceAnalysis, NormalizedLandmark, PhotoWarning } from "@/types/face";

type FaceCanvasProps = {
  imageUrl: string | null;
  onAnalysis: (analysis: FaceAnalysis | null) => void;
  onStatusChange?: (status: string) => void;
};

const groupColors: Record<string, string> = {
  jawline: "#52e6c7",
  cheekbones: "#f6b44b",
  leftEye: "#ecfdf5",
  rightEye: "#ecfdf5",
  leftBrow: "#9bd8ff",
  rightBrow: "#9bd8ff",
  nose: "#ffb86b",
  lips: "#ff7666",
  chin: "#52e6c7",
};

function warningFromError(error: unknown): PhotoWarning {
  const detail = error instanceof Error ? error.message : String(error);

  return {
    code: "MODEL_NOT_READY",
    severity: "fatal",
    label: "Analysis failed",
    detail: detail || "The model could not finish detection. Try another image.",
  };
}

function lineColor(tone?: string): string {
  if (tone === "mint") return "#52e6c7";
  if (tone === "amber") return "#f6b44b";
  if (tone === "coral") return "#ff7666";
  return "rgba(246, 248, 251, 0.82)";
}

export default function FaceCanvas({ imageUrl, onAnalysis, onStatusChange }: FaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PhotoWarning | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runAnalysis() {
      setError(null);
      onAnalysis(null);

      if (!imageUrl) {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        onStatusChange?.("Waiting for photo");
        return;
      }

      setIsLoading(true);
      onStatusChange?.("Loading face landmark model");

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.src = imageUrl;

      try {
        await image.decode();
        if (cancelled) return;

        imageRef.current = image;
        const detection = await detectFace(image);
        if (cancelled) return;

        const metrics = calculateFaceMetrics({
          detection,
          image,
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
        });
        const landmarks = detection.landmarks ?? [];
        const measurementLines = detection.landmarks
          ? buildMeasurementLines(detection.landmarks, image.naturalWidth, image.naturalHeight)
          : [];
        const analysis: FaceAnalysis = {
          landmarks,
          metrics,
          measurementLines,
          analyzedAt: new Date().toISOString(),
        };

        const fatalWarning = metrics.warnings.find((warning) => warning.severity === "fatal") ?? null;
        setError(fatalWarning);

        if (detection.landmarks) {
          drawCanvas(image, detection.landmarks, analysis);
        } else {
          drawImageOnly(image);
        }

        onAnalysis(analysis);
        onStatusChange?.(metrics.retakeRequired ? "Retake photo for accurate rating" : "Analysis complete");
      } catch (cause) {
        if (cancelled) return;
        const warning = warningFromError(cause);
        setError(warning);
        onStatusChange?.(warning.label);
        drawImageOnly(image);
        onAnalysis(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    runAnalysis();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, onAnalysis, onStatusChange]);

  function drawImageOnly(image: HTMLImageElement) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || image.naturalWidth === 0) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  function drawCanvas(image: HTMLImageElement, landmarks: NormalizedLandmark[], analysis: FaceAnalysis) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.lineWidth = Math.max(2, canvas.width / 420);
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 6;

    analysis.measurementLines.forEach((line) => {
      ctx.beginPath();
      ctx.strokeStyle = lineColor(line.tone);
      ctx.setLineDash(line.name === "centerline" ? [14, 10] : []);
      ctx.moveTo(line.from.x, line.from.y);
      ctx.lineTo(line.to.x, line.to.y);
      ctx.stroke();

      const labelX = (line.from.x + line.to.x) / 2;
      const labelY = (line.from.y + line.to.y) / 2;
      ctx.setLineDash([]);
      ctx.font = `${Math.max(13, canvas.width / 72)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(8, 11, 15, 0.78)";
      const textWidth = ctx.measureText(line.label).width;
      ctx.fillRect(labelX - textWidth / 2 - 6, labelY - 18, textWidth + 12, 22);
      ctx.fillStyle = "#f6f8fb";
      ctx.fillText(line.label, labelX - textWidth / 2, labelY - 3);
    });

    Object.entries(FACE_LANDMARK_GROUPS).forEach(([group, indexes]) => {
      ctx.fillStyle = groupColors[group] ?? "#ffffff";
      indexes.forEach((index) => {
        const point = mapLandmarkToPixel(landmarks[index], canvas.width, canvas.height);
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(2.5, canvas.width / 340), 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.restore();
  }

  return (
    <section className="relative overflow-hidden rounded-lg border border-line bg-panel shadow-glow">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Landmark overlay</h2>
          <p className="text-xs text-slate-400">Dots and lines are approximate MediaPipe landmark guides.</p>
        </div>
        <span className="rounded-md bg-panelSoft px-2.5 py-1 text-xs text-slate-300">
          {isLoading ? "Analyzing" : imageUrl ? "Ready" : "No photo"}
        </span>
      </div>

      <div className="relative flex min-h-[420px] items-center justify-center bg-ink/70 p-3">
        {!imageUrl ? (
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full border border-dashed border-line bg-panelSoft" />
            <p className="text-sm font-medium text-slate-200">Upload or capture a front-facing photo to begin.</p>
            <p className="mt-2 text-xs text-slate-500">The image stays in this browser session.</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="max-h-[72vh] w-full rounded-md object-contain" data-testid="face-canvas" />
        )}

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/72 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-slate-200">
              <Loader2 className="h-4 w-4 animate-spin text-mint" />
              Loading MediaPipe and placing landmarks
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-coral/40 bg-coral/12 p-3 text-sm text-coral">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">{error.label}</p>
                <p className="text-coral/85">{error.detail}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
