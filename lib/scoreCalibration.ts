import { clamp } from "@/lib/scoringUtils";
import type { PhotoWarning, ScoreBand } from "@/types/face";

export function calibrateScore(penaltyAdjustedScore: number, confidenceScore: number, hasWarnings: boolean): number {
  const adjusted = clamp(penaltyAdjustedScore, 0, 100);
  let calibrated = 55 + 0.6 * (adjusted - 55);

  if (adjusted > 88 && confidenceScore >= 85 && !hasWarnings) {
    calibrated += 0.9 * (adjusted - 88);
  }

  return Math.round(clamp(calibrated, 0, 95));
}

export function applyScoreCaps(score: number, confidenceScore: number, warnings: PhotoWarning[]): number | null {
  if (warnings.some((warning) => warning.severity === "fatal")) return null;
  if (confidenceScore < 50) return Math.min(score, 49);
  if (confidenceScore < 65) return Math.min(score, 59);
  if (confidenceScore < 75) return Math.min(score, 69);
  if (warnings.some((warning) => warning.severity === "warning")) return Math.min(score, 79);
  return Math.min(score, 95);
}

export function getScoreBand(score: number | null): ScoreBand {
  if (score == null) return "not_available";
  if (score >= 90) return "extremely_rare";
  if (score >= 80) return "very_strong";
  if (score >= 70) return "above_average";
  if (score >= 60) return "normal_decent";
  if (score >= 50) return "average";
  if (score >= 40) return "below_average_or_poor_quality";
  return "poor_input_or_weak_geometry";
}
