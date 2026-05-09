import type { FaceMetrics, LooksReport } from "@/types/face";

function scoreBand(score: number): string {
  if (score >= 86) return "Very balanced";
  if (score >= 72) return "Balanced";
  if (score >= 58) return "Moderately balanced";
  return "Photo-limited estimate";
}

function addIf(condition: boolean, target: string[], copy: string): void {
  if (condition) {
    target.push(copy);
  }
}

export function generateLooksReport(metrics: FaceMetrics): LooksReport {
  const strongPoints: string[] = [];
  const improvementAreas: string[] = [];
  const groomingSuggestions: string[] = [];

  addIf(metrics.symmetryScore >= 78, strongPoints, "The main left/right facial landmarks are closely aligned in this photo.");
  addIf(metrics.leftRightBalance >= 78, strongPoints, "The nose, mouth, and eye-center relationship reads as centered from the camera angle.");
  addIf(metrics.eyeSpacingRatio >= 0.8 && metrics.eyeSpacingRatio <= 1.25, strongPoints, "Eye spacing is close to the common one-eye-width reference.");
  addIf(metrics.jawlineDefinition >= 62, strongPoints, "The lower-face outline has visible structure in the landmark estimate.");
  addIf(metrics.cheekboneProminence >= 55, strongPoints, "The cheekbone-to-jaw relationship gives the midface some visible definition.");
  addIf(metrics.facialThirds.balanceScore >= 70, strongPoints, "The upper, middle, and lower facial thirds look relatively even in this image.");

  addIf(metrics.symmetryScore < 72, improvementAreas, "Retake with level eyes and the camera directly in front of the face to reduce angle-driven asymmetry.");
  addIf(metrics.leftRightBalance < 72, improvementAreas, "The face appears slightly rotated or off-center, which can shift balance measurements.");
  addIf(metrics.eyeSpacingRatio < 0.8 || metrics.eyeSpacingRatio > 1.25, improvementAreas, "Eye spacing differs from the simple one-eye-width reference used by this MVP.");
  addIf(metrics.noseToFaceWidthRatio > 0.24, improvementAreas, "Lighting and lens distance can exaggerate nose width; try a longer camera distance and even front lighting.");
  addIf(metrics.mouthToFaceWidthRatio < 0.28 || metrics.mouthToFaceWidthRatio > 0.52, improvementAreas, "Mouth width reads outside this MVP's neutral proportion band, which may be influenced by expression.");
  addIf(metrics.facialThirds.balanceScore < 68, improvementAreas, "Facial thirds are uneven in this photo; camera height and hairline visibility can strongly affect this estimate.");

  groomingSuggestions.push("Use a front-facing photo at eye height with a neutral expression and soft, even lighting.");
  groomingSuggestions.push("Keep hair away from the brows, cheekbones, jaw, and forehead so landmarks can be placed more accurately.");
  groomingSuggestions.push("Try a lens distance around arm's length or farther; very close selfies can distort nose and lower-face proportions.");
  addIf(metrics.jawlineDefinition < 58, groomingSuggestions, "For a sharper lower-face read in photos, use side lighting lightly and keep the chin level rather than tucked.");
  addIf(metrics.cheekboneProminence < 45, groomingSuggestions, "A hairstyle with some temple volume or cleaner cheek visibility can improve facial framing in photos.");

  if (strongPoints.length === 0) {
    strongPoints.push("The app detected a usable face mesh and produced a complete local measurement set.");
  }

  if (improvementAreas.length === 0) {
    improvementAreas.push("No major proportion flags were detected by this MVP; remaining differences are likely subtle or photo-dependent.");
  }

  return {
    scoreLabel: "Aesthetic balance estimate",
    score: metrics.aestheticBalanceScore,
    summary: `${scoreBand(metrics.aestheticBalanceScore)} landmark balance for this specific photo.`,
    strongPoints,
    improvementAreas,
    groomingSuggestions,
    photoWarnings: metrics.warnings.map((warning) => `${warning.label}: ${warning.detail}`),
    disclaimer: "This is an experimental computer-vision estimate, not an objective measure of attractiveness.",
    privacyNote:
      "Processing happens locally in your browser. FaceRate MVP does not upload or store photos; use Reset/Delete to clear the current image and results.",
  };
}
