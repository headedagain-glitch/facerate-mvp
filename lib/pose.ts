import { KEY_LANDMARKS } from "@/lib/faceLandmarks";
import { bandScore, distance, maxOnlyScore, midpoint, toPixelPoint } from "@/lib/scoringUtils";
import type { NormalizedLandmark, PhotoWarning } from "@/types/face";

export type PoseResult = {
  poseScore: number;
  rollDeg: number;
  yawProxy: number;
  pitchProxy: number;
  matrixYawDeg?: number;
  matrixPitchDeg?: number;
  matrixRollDeg?: number;
  usedTransformationMatrix: boolean;
  eyeWidthAsymmetry: number;
  warnings: PhotoWarning[];
};

function warning(code: PhotoWarning["code"], severity: PhotoWarning["severity"], label: string, detail: string): PhotoWarning {
  return { code, severity, label, detail };
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function extractMatrixPose(transformationMatrix?: number[]) {
  if (!transformationMatrix || transformationMatrix.length < 16 || transformationMatrix.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const m = transformationMatrix;
  const r00 = m[0];
  const r01 = m[1];
  const r02 = m[2];
  const r10 = m[4];
  const r11 = m[5];
  const r12 = m[6];
  const r20 = m[8];
  const r21 = m[9];
  const r22 = m[10];

  const yawDeg = radiansToDegrees(Math.atan2(r02, r22));
  const pitchDeg = radiansToDegrees(Math.atan2(-r12, Math.hypot(r02, r22)));
  const rollDeg = radiansToDegrees(Math.atan2(r10, r00));

  if (![yawDeg, pitchDeg, rollDeg, r01, r11, r20, r21].every(Number.isFinite)) {
    return null;
  }

  return {
    matrixYawDeg: yawDeg,
    matrixPitchDeg: pitchDeg,
    matrixRollDeg: rollDeg,
  };
}

export function calculatePoseScore(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number,
  transformationMatrix?: number[],
): PoseResult {
  const p = (index: number) => toPixelPoint(landmarks[index], imageWidth, imageHeight);
  const leftEyeOuter = p(KEY_LANDMARKS.leftEyeOuter);
  const leftEyeInner = p(KEY_LANDMARKS.leftEyeInner);
  const rightEyeInner = p(KEY_LANDMARKS.rightEyeInner);
  const rightEyeOuter = p(KEY_LANDMARKS.rightEyeOuter);
  const leftFace = p(KEY_LANDMARKS.leftFace);
  const rightFace = p(KEY_LANDMARKS.rightFace);
  const leftEyeCenter = midpoint(p(KEY_LANDMARKS.leftEyeOuter), p(KEY_LANDMARKS.leftEyeInner));
  const rightEyeCenter = midpoint(p(KEY_LANDMARKS.rightEyeInner), p(KEY_LANDMARKS.rightEyeOuter));
  const faceWidth = distance(leftFace, rightFace);
  const faceHeight = distance(p(KEY_LANDMARKS.topFace), p(KEY_LANDMARKS.chin));
  const rollRad = Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x);
  const rollDeg = Math.abs((rollRad * 180) / Math.PI);
  const faceCenterX = midpoint(leftFace, rightFace).x;
  const noseOffsetYawProxy = Math.abs(p(KEY_LANDMARKS.noseTip).x - faceCenterX) / Math.max(1, faceWidth);
  const leftEyeWidth = distance(leftEyeOuter, leftEyeInner);
  const rightEyeWidth = distance(rightEyeInner, rightEyeOuter);
  const avgEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
  const eyeWidthAsymmetry = Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(1, avgEyeWidth);
  const yawProxy = Math.max(noseOffsetYawProxy, eyeWidthAsymmetry * 0.45);
  const eyeCenterY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
  const pitchProxy = Math.abs((p(KEY_LANDMARKS.noseTip).y - eyeCenterY) / Math.max(1, faceHeight));
  const matrixPose = extractMatrixPose(transformationMatrix);
  const matrixYawAbs = Math.abs(matrixPose?.matrixYawDeg ?? 0);
  const matrixPitchAbs = Math.abs(matrixPose?.matrixPitchDeg ?? 0);
  const matrixRollAbs = Math.abs(matrixPose?.matrixRollDeg ?? 0);
  const rollScore = maxOnlyScore(rollDeg, 5, 14);
  const matrixRollScore = matrixPose ? maxOnlyScore(matrixRollAbs, 5, 14) : 100;
  const yawScore = Math.min(maxOnlyScore(yawProxy, 0.035, 0.11), matrixPose ? maxOnlyScore(matrixYawAbs, 5, 15) : 100);
  const pitchScore = Math.min(
    bandScore(pitchProxy, 0.28, 0.45, 0.18, 0.58),
    matrixPose ? maxOnlyScore(matrixPitchAbs, 10, 24) : 100,
  );
  const combinedRollScore = Math.min(rollScore, matrixRollScore);
  let poseScore = 0.45 * yawScore + 0.3 * pitchScore + 0.25 * combinedRollScore;
  const warnings: PhotoWarning[] = [];

  if (rollDeg > 14 || yawProxy > 0.11 || matrixYawAbs > 15) {
    warnings.push(warning("POSE_TOO_ROTATED", "fatal", "Face is too rotated", "Use a straight-on photo for accurate scoring."));
  } else if (rollDeg > 8 || yawProxy > 0.075 || matrixYawAbs > 9) {
    warnings.push(warning("POSE_TOO_ROTATED", "warning", "Face is slightly rotated", "Confidence is reduced by the face angle."));
  }

  if (warnings.some((item) => item.severity === "fatal")) {
    poseScore = Math.min(poseScore, 49);
  }

  return {
    poseScore,
    rollDeg,
    yawProxy,
    pitchProxy,
    matrixYawDeg: matrixPose?.matrixYawDeg,
    matrixPitchDeg: matrixPose?.matrixPitchDeg,
    matrixRollDeg: matrixPose?.matrixRollDeg,
    usedTransformationMatrix: Boolean(matrixPose),
    eyeWidthAsymmetry,
    warnings,
  };
}
