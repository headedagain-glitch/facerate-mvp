import type { NormalizedLandmark, PixelPoint } from "@/types/face";

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function toPixelPoint(landmark: NormalizedLandmark, imageWidth: number, imageHeight: number): PixelPoint {
  return {
    x: landmark.x * imageWidth,
    y: landmark.y * imageHeight,
  };
}

export function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: PixelPoint, b: PixelPoint): PixelPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function bandScore(value: number, goodMin: number, goodMax: number, hardMin: number, hardMax: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= goodMin && value <= goodMax) return 100;
  if (value < goodMin) {
    return 100 * clamp01((value - hardMin) / (goodMin - hardMin));
  }
  return 100 * clamp01((hardMax - value) / (hardMax - goodMax));
}

export function maxOnlyScore(value: number, goodMax: number, hardMax: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= goodMax) return 100;
  return 100 * clamp01((hardMax - value) / (hardMax - goodMax));
}

export function similarityRatioScore(a: number, b: number, maxLogRatio: number): number {
  if (a <= 0 || b <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const error = Math.abs(Math.log(a / b));
  return 100 * clamp01(1 - error / maxLogRatio);
}

export function hasFatalWarning(warnings: { severity: string }[]): boolean {
  return warnings.some((warning) => warning.severity === "fatal");
}
