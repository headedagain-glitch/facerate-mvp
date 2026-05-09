import { KEY_LANDMARKS, distance, getPoseAndQualityWarnings, mapLandmarkToPixel, midpoint } from "@/lib/faceLandmarks";
import type { FaceMetrics, NormalizedLandmark, PixelPoint, PhotoWarning } from "@/types/face";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ratioScore(value: number, target: number, tolerance: number): number {
  const drift = Math.abs(value - target) / tolerance;
  return clamp(100 - drift * 100, 0, 100);
}

function getPoint(landmarks: NormalizedLandmark[], index: number, width: number, height: number): PixelPoint {
  return mapLandmarkToPixel(landmarks[index], width, height);
}

function symmetryPairScore(leftDistance: number, rightDistance: number): number {
  const average = (Math.abs(leftDistance) + Math.abs(rightDistance)) / 2;
  if (average === 0) return 100;
  return clamp(100 - (Math.abs(leftDistance - rightDistance) / average) * 100, 0, 100);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function calculateFaceMetrics(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number,
  extraWarnings: PhotoWarning[] = [],
): FaceMetrics {
  const p = (index: number) => getPoint(landmarks, index, imageWidth, imageHeight);
  const leftFace = p(KEY_LANDMARKS.leftFace);
  const rightFace = p(KEY_LANDMARKS.rightFace);
  const topFace = p(KEY_LANDMARKS.topFace);
  const chin = p(KEY_LANDMARKS.chin);
  const center = midpoint(leftFace, rightFace);

  const faceWidth = distance(leftFace, rightFace);
  const faceHeight = distance(topFace, chin);
  const leftEyeWidth = distance(p(KEY_LANDMARKS.leftEyeOuter), p(KEY_LANDMARKS.leftEyeInner));
  const rightEyeWidth = distance(p(KEY_LANDMARKS.rightEyeInner), p(KEY_LANDMARKS.rightEyeOuter));
  const eyeSpacing = distance(p(KEY_LANDMARKS.leftEyeInner), p(KEY_LANDMARKS.rightEyeInner));
  const jawWidth = distance(p(KEY_LANDMARKS.leftJaw), p(KEY_LANDMARKS.rightJaw));
  const noseWidth = distance(p(KEY_LANDMARKS.noseLeft), p(KEY_LANDMARKS.noseRight));
  const mouthWidth = distance(p(KEY_LANDMARKS.mouthLeft), p(KEY_LANDMARKS.mouthRight));
  const cheekWidth = distance(p(KEY_LANDMARKS.leftCheek), p(KEY_LANDMARKS.rightCheek));

  // Symmetry is estimated by comparing mirrored horizontal distances from the face center.
  // This is photo-dependent and not a scientific or medical measurement.
  const symmetryScores = [
    symmetryPairScore(Math.abs(center.x - p(KEY_LANDMARKS.leftEyeOuter).x), Math.abs(p(KEY_LANDMARKS.rightEyeOuter).x - center.x)),
    symmetryPairScore(Math.abs(center.x - p(KEY_LANDMARKS.leftJaw).x), Math.abs(p(KEY_LANDMARKS.rightJaw).x - center.x)),
    symmetryPairScore(Math.abs(center.x - p(KEY_LANDMARKS.mouthLeft).x), Math.abs(p(KEY_LANDMARKS.mouthRight).x - center.x)),
    symmetryPairScore(Math.abs(center.x - p(KEY_LANDMARKS.noseLeft).x), Math.abs(p(KEY_LANDMARKS.noseRight).x - center.x)),
  ];

  const symmetryScore = Math.round(average(symmetryScores));
  const leftRightBalance = Math.round(
    clamp(100 - (Math.abs(p(KEY_LANDMARKS.noseTip).x - center.x) / Math.max(1, faceWidth)) * 320, 0, 100),
  );

  const faceWidthToHeightRatio = faceWidth / Math.max(1, faceHeight);
  const eyeSpacingRatio = eyeSpacing / Math.max(1, average([leftEyeWidth, rightEyeWidth]));
  const jawToFaceWidthRatio = jawWidth / Math.max(1, faceWidth);
  const noseToFaceWidthRatio = noseWidth / Math.max(1, faceWidth);
  const mouthToFaceWidthRatio = mouthWidth / Math.max(1, faceWidth);

  const cheekboneProminence = Math.round(clamp(((cheekWidth / Math.max(1, jawWidth) - 1) / 0.2) * 100, 0, 100));
  const jawlineDefinition = Math.round(
    clamp(((jawWidth / Math.max(1, faceWidth) - 0.58) / 0.24) * 100 + (1 - Math.abs(faceWidthToHeightRatio - 0.72)) * 20, 0, 100),
  );

  const browLine = p(KEY_LANDMARKS.browCenter).y;
  const noseBase = p(KEY_LANDMARKS.noseBase).y;
  const upper = Math.max(1, browLine - topFace.y);
  const middle = Math.max(1, noseBase - browLine);
  const lower = Math.max(1, chin.y - noseBase);
  const thirdsTotal = upper + middle + lower;
  const thirds = [upper, middle, lower].map((value) => value / thirdsTotal);
  const facialThirdsBalance = Math.round(average(thirds.map((value) => ratioScore(value, 1 / 3, 0.18))));

  const proportionScore = Math.round(
    average([
      ratioScore(faceWidthToHeightRatio, 0.72, 0.22),
      ratioScore(eyeSpacingRatio, 1, 0.55),
      ratioScore(jawToFaceWidthRatio, 0.72, 0.22),
      ratioScore(noseToFaceWidthRatio, 0.18, 0.08),
      ratioScore(mouthToFaceWidthRatio, 0.38, 0.16),
      facialThirdsBalance,
    ]),
  );

  const warningPenalty = Math.min(12, (extraWarnings.length + getPoseAndQualityWarnings(landmarks, imageWidth, imageHeight).length) * 3);
  const aestheticBalanceScore = Math.round(clamp(average([symmetryScore, leftRightBalance, proportionScore]) - warningPenalty, 0, 100));

  const warningsByCode = new Map<string, PhotoWarning>();
  [...getPoseAndQualityWarnings(landmarks, imageWidth, imageHeight), ...extraWarnings].forEach((warning) => {
    warningsByCode.set(warning.code, warning);
  });

  return {
    aestheticBalanceScore,
    symmetryScore,
    leftRightBalance,
    faceWidthToHeightRatio,
    eyeSpacingRatio,
    jawToFaceWidthRatio,
    noseToFaceWidthRatio,
    mouthToFaceWidthRatio,
    cheekboneProminence,
    jawlineDefinition,
    facialThirds: {
      upper: thirds[0],
      middle: thirds[1],
      lower: thirds[2],
      balanceScore: facialThirdsBalance,
    },
    warnings: Array.from(warningsByCode.values()),
  };
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}
