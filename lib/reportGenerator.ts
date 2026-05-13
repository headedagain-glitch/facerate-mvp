import type { FaceScoreResult, LooksReport } from "@/types/face";

function scoreBandCopy(score: number | null): string {
  if (score == null) return "Photo retake required";
  if (score >= 90) return "Extremely rare balance range";
  if (score >= 80) return "Very strong balance range";
  if (score >= 70) return "Above-average balance range";
  if (score >= 60) return "Normal / decent balance range";
  if (score >= 50) return "Average balance range";
  if (score >= 40) return "Below average or poor-quality photo range";
  return "Poor input or weak geometry signal";
}

function addIf(condition: boolean, target: string[], copy: string): void {
  if (condition) {
    target.push(copy);
  }
}

export function generateLooksReport(metrics: FaceScoreResult): LooksReport {
  const strongPoints: string[] = [];
  const improvementAreas: string[] = [];
  const groomingSuggestions: string[] = [];

  if (metrics.retakeRequired) {
    improvementAreas.push("Retake with a clear, centered, neutral, front-facing photo before reading the score.");
  } else {
    addIf(metrics.symmetryScore >= 78, strongPoints, "The main left/right facial landmarks are closely aligned in this photo.");
    addIf(metrics.proportionScore >= 74, strongPoints, "The main facial proportions sit inside the balanced reference bands used by this MVP.");
    addIf(metrics.eyeAreaBalanceScore >= 74, strongPoints, "Eye width and openness are relatively even in the detected landmarks.");
    addIf(metrics.jawChinBalanceScore >= 72, strongPoints, "The lower-face and chin landmarks read as centered from this camera angle.");
    addIf(metrics.noseMouthProportionalityScore >= 72, strongPoints, "Nose and mouth width are proportionally stable in this image.");

    addIf(metrics.symmetryScore < 68, improvementAreas, "Level the camera and face it directly to reduce angle-driven asymmetry.");
    addIf(metrics.proportionScore < 68, improvementAreas, "Use a less distorted lens distance; close selfies can shift width and spacing ratios.");
    addIf(metrics.eyeAreaBalanceScore < 68, improvementAreas, "Use even lighting and a relaxed gaze so the eye-area landmarks are easier to place.");
    addIf(metrics.jawChinBalanceScore < 68, improvementAreas, "Keep the chin level and the full jaw visible for a clearer lower-face estimate.");
    addIf(metrics.noseMouthProportionalityScore < 68, improvementAreas, "Use a neutral expression and eye-level camera height for more stable nose and mouth ratios.");
  }

  groomingSuggestions.push("Use soft, even front lighting and keep the camera at eye height.");
  groomingSuggestions.push("Use a neutral expression with the mouth closed for the most reliable estimate.");
  groomingSuggestions.push("Keep hair, hats, glasses glare, and shadows away from the brows, eyes, cheeks, jaw, and forehead.");

  if (strongPoints.length === 0 && !metrics.retakeRequired) {
    strongPoints.push("The app detected one usable face mesh and produced a complete local measurement set.");
  }

  if (improvementAreas.length === 0) {
    improvementAreas.push("No major retake gate was triggered; remaining differences are likely subtle or photo-dependent.");
  }

  return {
    scoreLabel: "Aesthetic Balance Score",
    score: metrics.finalAestheticBalanceScore,
    summary: metrics.retakeRequired
      ? "Retake with a clear, centered, neutral, front-facing photo for a usable estimate."
      : `${scoreBandCopy(metrics.finalAestheticBalanceScore)} for this specific photo.`,
    strongPoints,
    improvementAreas,
    groomingSuggestions,
    photoWarnings: metrics.warnings.map((warning) => `${warning.label}: ${warning.detail}`),
    disclaimer: "This score is a heuristic estimate of facial balance from a single photo. It is not an objective measure of attractiveness.",
    privacyNote:
      "Processing happens locally in your browser. FaceRate MVP does not upload or store photos; use Reset/Delete to clear the current image and results.",
  };
}
