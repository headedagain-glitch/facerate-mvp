import { KEY_LANDMARKS } from "@/lib/faceLandmarks";
import { distance, maxOnlyScore, toPixelPoint } from "@/lib/scoringUtils";
import type { FaceBlendshapeMap, NormalizedLandmark, PhotoWarning } from "@/types/face";

export type ExpressionResult = {
  expressionNeutralityScore: number;
  mouthOpenRatio: number;
  jawOpen: number;
  smile: number;
  browInnerUp: number;
  squint: number;
  warnings: PhotoWarning[];
};

function warning(code: PhotoWarning["code"], severity: PhotoWarning["severity"], label: string, detail: string): PhotoWarning {
  return { code, severity, label, detail };
}

function getBlendshape(blendshapes: FaceBlendshapeMap, name: string): number {
  return blendshapes[name] ?? 0;
}

export function calculateExpressionScore(
  landmarks: NormalizedLandmark[],
  blendshapes: FaceBlendshapeMap,
  imageWidth: number,
  imageHeight: number,
): ExpressionResult {
  const p = (index: number) => toPixelPoint(landmarks[index], imageWidth, imageHeight);
  const mouthWidth = distance(p(KEY_LANDMARKS.mouthLeft), p(KEY_LANDMARKS.mouthRight));
  const mouthOpenRatio = distance(p(KEY_LANDMARKS.mouthTop), p(KEY_LANDMARKS.mouthBottom)) / Math.max(1, mouthWidth);
  const mouthClosedScore = maxOnlyScore(mouthOpenRatio, 0.045, 0.12);
  const jawOpen = getBlendshape(blendshapes, "jawOpen");
  const smile = Math.max(getBlendshape(blendshapes, "mouthSmileLeft"), getBlendshape(blendshapes, "mouthSmileRight"));
  const browInnerUp = getBlendshape(blendshapes, "browInnerUp");
  const squint = Math.max(getBlendshape(blendshapes, "eyeSquintLeft"), getBlendshape(blendshapes, "eyeSquintRight"));
  const jawOpenScore = maxOnlyScore(jawOpen, 0.08, 0.22);
  const smileScore = maxOnlyScore(smile, 0.18, 0.38);
  const browScore = maxOnlyScore(browInnerUp, 0.15, 0.45);
  const squintScore = maxOnlyScore(squint, 0.18, 0.45);
  const expressionNeutralityScore =
    0.45 * mouthClosedScore + 0.25 * jawOpenScore + 0.15 * smileScore + 0.1 * squintScore + 0.05 * browScore;
  const warnings: PhotoWarning[] = [];

  if (mouthOpenRatio > 0.12 || jawOpen > 0.22) {
    warnings.push(warning("OPEN_MOUTH", "fatal", "Mouth is open", "Use a closed-mouth neutral expression for accurate scoring."));
  } else if (mouthOpenRatio > 0.075) {
    warnings.push(warning("OPEN_MOUTH", "warning", "Mouth appears open", "A neutral closed-mouth expression improves confidence."));
  }

  if (smile > 0.38 || browInnerUp > 0.45 || squint > 0.45) {
    warnings.push(warning("EXTREME_EXPRESSION", "fatal", "Expression is too strong", "Use a relaxed neutral expression for accurate scoring."));
  }

  return {
    expressionNeutralityScore,
    mouthOpenRatio,
    jawOpen,
    smile,
    browInnerUp,
    squint,
    warnings,
  };
}
