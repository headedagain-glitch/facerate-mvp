import { KEY_LANDMARKS } from "@/lib/faceLandmarks";
import { calculateExpressionScore } from "@/lib/expression";
import { type PhotoQualityOverrides, calculatePhotoQuality } from "@/lib/photoQuality";
import { calculatePoseScore } from "@/lib/pose";
import { applyScoreCaps, calibrateScore, getScoreBand } from "@/lib/scoreCalibration";
import {
  average,
  bandScore,
  clamp,
  distance,
  hasFatalWarning,
  maxOnlyScore,
  midpoint,
  similarityRatioScore,
  toPixelPoint,
} from "@/lib/scoringUtils";
import type { FaceDetectionPayload, FaceScoreResult, NormalizedLandmark, PhotoWarning, PixelPoint } from "@/types/face";

type ImageLike = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export type CalculateFaceMetricsInput = {
  detection: FaceDetectionPayload;
  image?: ImageLike;
  imageWidth: number;
  imageHeight: number;
  photoQualityOverrides?: PhotoQualityOverrides;
};

function warning(code: PhotoWarning["code"], severity: PhotoWarning["severity"], label: string, detail: string): PhotoWarning {
  return { code, severity, label, detail };
}

function mergeWarnings(warnings: PhotoWarning[]): PhotoWarning[] {
  const severityRank: Record<PhotoWarning["severity"], number> = {
    info: 0,
    warning: 1,
    fatal: 2,
  };
  const byCode = new Map<PhotoWarning["code"], PhotoWarning>();

  warnings.forEach((item) => {
    const current = byCode.get(item.code);
    if (!current || severityRank[item.severity] > severityRank[current.severity]) {
      byCode.set(item.code, item);
    }
  });

  return Array.from(byCode.values());
}

function emptyScoreResult(warnings: PhotoWarning[], debugMetrics: FaceScoreResult["debugMetrics"] = {}): FaceScoreResult {
  const mergedWarnings = mergeWarnings(warnings);

  return {
    finalAestheticBalanceScore: null,
    confidenceScore: 0,
    geometryScore: 0,
    symmetryScore: 0,
    proportionScore: 0,
    jawChinBalanceScore: 0,
    eyeAreaBalanceScore: 0,
    noseMouthProportionalityScore: 0,
    photoQualityScore: 0,
    landmarkConfidenceScore: 0,
    poseScore: 0,
    expressionNeutralityScore: 0,
    retakeRequired: true,
    warnings: mergedWarnings,
    scoreBand: "not_available",
    debugMetrics,
  };
}

function p(landmarks: NormalizedLandmark[], index: number, imageWidth: number, imageHeight: number): PixelPoint {
  return toPixelPoint(landmarks[index], imageWidth, imageHeight);
}

function calculateLandmarkConfidence(
  landmarks: NormalizedLandmark[],
  photoMarginScore: number,
  imageWidth: number,
  imageHeight: number,
): { landmarkConfidenceScore: number; warnings: PhotoWarning[]; finiteScore: number; topologyScore: number } {
  const keyIndexes = Object.values(KEY_LANDMARKS);
  const finiteCount = keyIndexes.filter((index) => {
    const landmark = landmarks[index];
    return (
      landmark &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      landmark.x >= -0.05 &&
      landmark.x <= 1.05 &&
      landmark.y >= -0.05 &&
      landmark.y <= 1.05
    );
  }).length;
  const finiteScore = (finiteCount / keyIndexes.length) * 100;
  const point = (index: number) => p(landmarks, index, imageWidth, imageHeight);
  const checks = [
    point(KEY_LANDMARKS.leftEyeOuter).x < point(KEY_LANDMARKS.leftEyeInner).x,
    point(KEY_LANDMARKS.rightEyeInner).x < point(KEY_LANDMARKS.rightEyeOuter).x,
    point(KEY_LANDMARKS.topFace).y < point(KEY_LANDMARKS.chin).y,
    point(KEY_LANDMARKS.mouthTop).y < point(KEY_LANDMARKS.mouthBottom).y,
    point(KEY_LANDMARKS.leftFace).x < point(KEY_LANDMARKS.rightFace).x,
    distance(point(KEY_LANDMARKS.leftFace), point(KEY_LANDMARKS.rightFace)) > 0,
    distance(point(KEY_LANDMARKS.topFace), point(KEY_LANDMARKS.chin)) > 0,
  ];
  const topologyScore = (checks.filter(Boolean).length / checks.length) * 100;
  // MediaPipe web result does not expose a simple per-face landmark confidence here.
  // This is a proxy based on topology, finite coordinates, and crop margin.
  const fallbackPresenceScore = 85;
  const landmarkConfidenceScore = clamp(
    0.35 * finiteScore + 0.25 * topologyScore + 0.2 * photoMarginScore + 0.2 * fallbackPresenceScore,
  );
  const warnings: PhotoWarning[] = [];

  if (finiteScore < 95 || topologyScore < 80) {
    warnings.push(
      warning(
        "LANDMARKS_UNRELIABLE",
        "fatal",
        "Landmarks are unreliable",
        "Retake with a clear, centered, front-facing photo so the face mesh can be placed reliably.",
      ),
    );
  }

  return {
    landmarkConfidenceScore,
    warnings,
    finiteScore,
    topologyScore,
  };
}

function calculateGeometryScores(landmarks: NormalizedLandmark[], imageWidth: number, imageHeight: number) {
  const point = (index: number) => p(landmarks, index, imageWidth, imageHeight);
  const leftFace = point(KEY_LANDMARKS.leftFace);
  const rightFace = point(KEY_LANDMARKS.rightFace);
  const topFace = point(KEY_LANDMARKS.topFace);
  const chin = point(KEY_LANDMARKS.chin);
  const faceWidth = distance(leftFace, rightFace);
  const faceHeight = distance(topFace, chin);
  const leftEyeOuter = point(KEY_LANDMARKS.leftEyeOuter);
  const leftEyeInner = point(KEY_LANDMARKS.leftEyeInner);
  const rightEyeInner = point(KEY_LANDMARKS.rightEyeInner);
  const rightEyeOuter = point(KEY_LANDMARKS.rightEyeOuter);
  const leftEyeWidth = distance(leftEyeOuter, leftEyeInner);
  const rightEyeWidth = distance(rightEyeInner, rightEyeOuter);
  const avgEyeWidth = average([leftEyeWidth, rightEyeWidth]);
  const leftEyeCenter = midpoint(leftEyeOuter, leftEyeInner);
  const rightEyeCenter = midpoint(rightEyeInner, rightEyeOuter);
  const interpupillaryDistance = distance(leftEyeCenter, rightEyeCenter);
  const innerEyeDistance = distance(leftEyeInner, rightEyeInner);
  const jawWidth = distance(point(KEY_LANDMARKS.leftJaw), point(KEY_LANDMARKS.rightJaw));
  const cheekboneWidth = faceWidth;
  const noseWidth = distance(point(KEY_LANDMARKS.noseLeft), point(KEY_LANDMARKS.noseRight));
  const mouthWidth = distance(point(KEY_LANDMARKS.mouthLeft), point(KEY_LANDMARKS.mouthRight));
  const faceCenterX = midpoint(leftFace, rightFace).x;
  const faceWidthToHeightRatio = faceWidth / Math.max(1, faceHeight);
  const faceWidthToHeightScore = bandScore(faceWidthToHeightRatio, 0.58, 0.78, 0.48, 0.92);
  const ipdToFaceWidthRatio = interpupillaryDistance / Math.max(1, faceWidth);
  const ipdScore = bandScore(ipdToFaceWidthRatio, 0.38, 0.48, 0.3, 0.56);
  const eyeSpacingRatio = innerEyeDistance / Math.max(1, avgEyeWidth);
  const eyeSpacingScore = bandScore(eyeSpacingRatio, 0.85, 1.25, 0.55, 1.65);
  const browLine = average([point(KEY_LANDMARKS.leftBrowInner).y, point(KEY_LANDMARKS.rightBrowInner).y]);
  const noseBase = point(KEY_LANDMARKS.noseBase).y;
  const upperThird = Math.max(1, browLine - topFace.y);
  const middleThird = Math.max(1, noseBase - browLine);
  const lowerThird = Math.max(1, chin.y - noseBase);
  const thirdsTotal = upperThird + middleThird + lowerThird;
  const thirds = [upperThird / thirdsTotal, middleThird / thirdsTotal, lowerThird / thirdsTotal];
  const verticalThirdsScore = average(thirds.map((value) => bandScore(value, 0.28, 0.39, 0.18, 0.5)));
  const noseCenterOffset = Math.abs(point(KEY_LANDMARKS.noseTip).x - faceCenterX) / Math.max(1, faceWidth);
  const noseCenterScore = maxOnlyScore(noseCenterOffset, 0.025, 0.09);
  const mirrorPairs: Array<[number, number, number]> = [
    [33, 263, 1],
    [133, 362, 1],
    [159, 386, 0.7],
    [145, 374, 0.7],
    [61, 291, 0.9],
    [70, 300, 0.6],
    [105, 334, 0.6],
    [172, 397, 0.8],
    [234, 454, 0.8],
  ];
  let weightedError = 0;
  let totalWeight = 0;

  mirrorPairs.forEach(([leftIndex, rightIndex, weight]) => {
    const left = point(leftIndex);
    const right = point(rightIndex);
    const mirroredXError = Math.abs(left.x - faceCenterX + right.x - faceCenterX);
    const yError = Math.abs(left.y - right.y);
    const pairError = Math.hypot(mirroredXError, yError) / Math.max(1, faceWidth);
    weightedError += pairError * weight;
    totalWeight += weight;
  });

  const mirrorError = weightedError / Math.max(1, totalWeight);
  const mirrorSymmetryScore = 100 * Math.exp(-((mirrorError / 0.045) ** 2));
  const eyeWidthSymmetryScore = similarityRatioScore(leftEyeWidth, rightEyeWidth, Math.log(1.2));
  const eyebrowSymmetryScore = similarityRatioScore(
    Math.abs(point(KEY_LANDMARKS.leftBrow).y - leftEyeCenter.y),
    Math.abs(point(KEY_LANDMARKS.rightBrow).y - rightEyeCenter.y),
    Math.log(1.25),
  );
  const mouthCornerSymmetryScore = similarityRatioScore(
    Math.abs(point(KEY_LANDMARKS.mouthLeft).x - faceCenterX),
    Math.abs(point(KEY_LANDMARKS.mouthRight).x - faceCenterX),
    Math.log(1.2),
  );
  const jawSymmetryScore = similarityRatioScore(
    Math.abs(point(KEY_LANDMARKS.leftJaw).x - faceCenterX),
    Math.abs(point(KEY_LANDMARKS.rightJaw).x - faceCenterX),
    Math.log(1.2),
  );
  const symmetryScore =
    0.45 * mirrorSymmetryScore +
    0.25 * eyeWidthSymmetryScore +
    0.15 * eyebrowSymmetryScore +
    0.15 * average([mouthCornerSymmetryScore, jawSymmetryScore]);
  const proportionScore =
    0.3 * faceWidthToHeightScore + 0.25 * ipdScore + 0.2 * verticalThirdsScore + 0.15 * eyeSpacingScore + 0.1 * noseCenterScore;
  const jawToCheekRatio = jawWidth / Math.max(1, cheekboneWidth);
  const jawToCheekScore = bandScore(jawToCheekRatio, 0.62, 0.82, 0.45, 0.95);
  const chinBalanceScore = maxOnlyScore(Math.abs(chin.x - faceCenterX) / Math.max(1, faceWidth), 0.015, 0.08);
  const jawChinBalanceScore = 0.55 * jawToCheekScore + 0.45 * chinBalanceScore;
  const leftEyeOpen = distance(point(KEY_LANDMARKS.leftEyeUpper), point(KEY_LANDMARKS.leftEyeLower));
  const rightEyeOpen = distance(point(KEY_LANDMARKS.rightEyeUpper), point(KEY_LANDMARKS.rightEyeLower));
  const eyeOpenSymmetryScore = similarityRatioScore(leftEyeOpen, rightEyeOpen, Math.log(1.25));
  const eyeOpennessScore = bandScore(average([leftEyeOpen, rightEyeOpen]) / Math.max(1, avgEyeWidth), 0.18, 0.38, 0.08, 0.5);
  const eyeAreaBalanceScore = 0.45 * eyeWidthSymmetryScore + 0.35 * eyeOpenSymmetryScore + 0.2 * eyeOpennessScore;
  const noseWidthRatio = noseWidth / Math.max(1, faceWidth);
  const mouthWidthRatio = mouthWidth / Math.max(1, faceWidth);
  const noseWidthScore = bandScore(noseWidthRatio, 0.13, 0.22, 0.08, 0.3);
  const mouthWidthScore = bandScore(mouthWidthRatio, 0.3, 0.48, 0.22, 0.6);
  const noseMouthProportionalityScore = 0.45 * noseWidthScore + 0.35 * mouthWidthScore + 0.2 * noseCenterScore;
  const geometryScore =
    0.34 * symmetryScore +
    0.26 * proportionScore +
    0.14 * jawChinBalanceScore +
    0.13 * eyeAreaBalanceScore +
    0.13 * noseMouthProportionalityScore;

  return {
    geometryScore: clamp(geometryScore),
    symmetryScore: clamp(symmetryScore),
    proportionScore: clamp(proportionScore),
    jawChinBalanceScore: clamp(jawChinBalanceScore),
    eyeAreaBalanceScore: clamp(eyeAreaBalanceScore),
    noseMouthProportionalityScore: clamp(noseMouthProportionalityScore),
    faceWidthToHeightRatio,
    ipdToFaceWidthRatio,
    eyeSpacingRatio,
    jawToCheekRatio,
    noseWidthRatio,
    mouthWidthRatio,
    verticalThirdsScore,
    mirrorError,
    noseCenterOffset,
    eyeOpennessRatio: average([leftEyeOpen, rightEyeOpen]) / Math.max(1, avgEyeWidth),
  };
}

export function calculateFaceMetrics({
  detection,
  image,
  imageWidth,
  imageHeight,
  photoQualityOverrides,
}: CalculateFaceMetricsInput): FaceScoreResult {
  if (detection.faceCount === 0) {
    return emptyScoreResult([
      warning("NO_FACE", "fatal", "No face detected", "Upload a clear, centered, front-facing adult face photo."),
    ]);
  }

  if (detection.faceCount > 1) {
    return emptyScoreResult([
      warning("MULTIPLE_FACES", "fatal", "Multiple faces detected", "Use a photo with exactly one visible face."),
    ]);
  }

  if (!detection.landmarks) {
    return emptyScoreResult([
      warning("LANDMARKS_UNRELIABLE", "fatal", "Landmarks are unavailable", "Retake with a clearer front-facing photo."),
    ]);
  }

  const landmarks = detection.landmarks;
  const photoQuality = calculatePhotoQuality({ landmarks, image, imageWidth, imageHeight, overrides: photoQualityOverrides });
  const photoMarginScore = clamp(((photoQuality.minMargin - 0.015) / 0.08) * 100);
  const landmarkConfidence = calculateLandmarkConfidence(landmarks, photoMarginScore, imageWidth, imageHeight);
  const pose = calculatePoseScore(landmarks, imageWidth, imageHeight, detection.transformationMatrix);
  const expression = calculateExpressionScore(landmarks, detection.blendshapes, imageWidth, imageHeight);
  const geometry = calculateGeometryScores(landmarks, imageWidth, imageHeight);
  const warnings = mergeWarnings([
    ...photoQuality.warnings,
    ...landmarkConfidence.warnings,
    ...pose.warnings,
    ...expression.warnings,
  ]);
  const penaltyAdjustedScore = clamp(
    geometry.geometryScore -
      0.22 * (100 - photoQuality.photoQualityScore) -
      0.24 * (100 - pose.poseScore) -
      0.26 * (100 - expression.expressionNeutralityScore) -
      0.16 * (100 - landmarkConfidence.landmarkConfidenceScore),
  );
  const rawConfidenceScore = clamp(
    0.4 * photoQuality.photoQualityScore +
      0.2 * landmarkConfidence.landmarkConfidenceScore +
      0.2 * pose.poseScore +
      0.2 * expression.expressionNeutralityScore,
  );
  const confidenceScore = hasFatalWarning(warnings)
    ? Math.min(rawConfidenceScore, 49)
    : warnings.some((warningItem) => warningItem.severity === "warning")
      ? Math.min(rawConfidenceScore, 85)
      : rawConfidenceScore;
  const calibratedScore = calibrateScore(penaltyAdjustedScore, confidenceScore, warnings.length > 0);
  const finalAestheticBalanceScore = applyScoreCaps(calibratedScore, confidenceScore, warnings);
  const retakeRequired = hasFatalWarning(warnings);

  return {
    finalAestheticBalanceScore,
    confidenceScore: Math.round(confidenceScore),
    geometryScore: Math.round(geometry.geometryScore),
    symmetryScore: Math.round(geometry.symmetryScore),
    proportionScore: Math.round(geometry.proportionScore),
    jawChinBalanceScore: Math.round(geometry.jawChinBalanceScore),
    eyeAreaBalanceScore: Math.round(geometry.eyeAreaBalanceScore),
    noseMouthProportionalityScore: Math.round(geometry.noseMouthProportionalityScore),
    photoQualityScore: Math.round(photoQuality.photoQualityScore),
    landmarkConfidenceScore: Math.round(landmarkConfidence.landmarkConfidenceScore),
    poseScore: Math.round(pose.poseScore),
    expressionNeutralityScore: Math.round(expression.expressionNeutralityScore),
    retakeRequired,
    warnings,
    scoreBand: getScoreBand(finalAestheticBalanceScore),
    debugMetrics: {
      faceWidthToHeightRatio: geometry.faceWidthToHeightRatio,
      ipdToFaceWidthRatio: geometry.ipdToFaceWidthRatio,
      eyeSpacingRatio: geometry.eyeSpacingRatio,
      jawToCheekRatio: geometry.jawToCheekRatio,
      noseWidthRatio: geometry.noseWidthRatio,
      mouthWidthRatio: geometry.mouthWidthRatio,
      verticalThirdsScore: geometry.verticalThirdsScore,
      mirrorError: geometry.mirrorError,
      noseCenterOffset: geometry.noseCenterOffset,
      eyeOpennessRatio: geometry.eyeOpennessRatio,
      penaltyAdjustedScore,
      rawConfidenceScore,
      calibratedScore,
      rollDeg: pose.rollDeg,
      yawProxy: pose.yawProxy,
      pitchProxy: pose.pitchProxy,
      matrixYawDeg: pose.matrixYawDeg ?? "n/a",
      matrixPitchDeg: pose.matrixPitchDeg ?? "n/a",
      matrixRollDeg: pose.matrixRollDeg ?? "n/a",
      usedTransformationMatrix: pose.usedTransformationMatrix,
      eyeWidthAsymmetry: pose.eyeWidthAsymmetry,
      mouthOpenRatio: expression.mouthOpenRatio,
      jawOpen: expression.jawOpen,
      smile: expression.smile,
      browInnerUp: expression.browInnerUp,
      squint: expression.squint,
      blurVariance: photoQuality.blurVariance,
      meanLuminance: photoQuality.meanLuminance,
      luminanceStd: photoQuality.luminanceStd,
      lightingDiff: photoQuality.lightingDiff,
      faceWidthNorm: photoQuality.faceWidthNorm,
      faceHeightNorm: photoQuality.faceHeightNorm,
      centerDistance: photoQuality.centerDistance,
      minMargin: photoQuality.minMargin,
      finiteScore: landmarkConfidence.finiteScore,
      topologyScore: landmarkConfidence.topologyScore,
      retakeRequired,
    },
  };
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}
