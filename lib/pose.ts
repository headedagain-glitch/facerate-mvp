import { KEY_LANDMARKS } from "@/lib/faceLandmarks";
import { bandScore, distance, maxOnlyScore, midpoint, toPixelPoint } from "@/lib/scoringUtils";
import type { NormalizedLandmark, PhotoWarning } from "@/types/face";

export type PoseResult = {
  poseScore: number;
  rollDeg: number;
  yawProxy: number;
  pitchProxy: number;
  warnings: PhotoWarning[];
};

function warning(code: PhotoWarning["code"], severity: PhotoWarning["severity"], label: string, detail: string): PhotoWarning {
  return { code, severity, label, detail };
}

export function calculatePoseScore(landmarks: NormalizedLandmark[], imageWidth: number, imageHeight: number): PoseResult {
  const p = (index: number) => toPixelPoint(landmarks[index], imageWidth, imageHeight);
  const leftEyeCenter = midpoint(p(KEY_LANDMARKS.leftEyeOuter), p(KEY_LANDMARKS.leftEyeInner));
  const rightEyeCenter = midpoint(p(KEY_LANDMARKS.rightEyeInner), p(KEY_LANDMARKS.rightEyeOuter));
  const faceWidth = distance(p(KEY_LANDMARKS.leftFace), p(KEY_LANDMARKS.rightFace));
  const faceHeight = distance(p(KEY_LANDMARKS.topFace), p(KEY_LANDMARKS.chin));
  const rollRad = Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x);
  const rollDeg = Math.abs((rollRad * 180) / Math.PI);
  const faceCenterX = (p(KEY_LANDMARKS.noseBridge).x + p(KEY_LANDMARKS.noseTip).x + p(KEY_LANDMARKS.chin).x) / 3;
  const yawProxy = Math.abs(p(KEY_LANDMARKS.noseTip).x - faceCenterX) / Math.max(1, faceWidth);
  const eyeCenterY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
  const pitchProxy = Math.abs((p(KEY_LANDMARKS.noseTip).y - eyeCenterY) / Math.max(1, faceHeight));
  const rollScore = maxOnlyScore(rollDeg, 5, 14);
  const yawScore = maxOnlyScore(yawProxy, 0.035, 0.11);
  const pitchScore = bandScore(pitchProxy, 0.28, 0.45, 0.18, 0.58);
  let poseScore = 0.45 * yawScore + 0.3 * pitchScore + 0.25 * rollScore;
  const warnings: PhotoWarning[] = [];

  if (rollDeg > 14 || yawProxy > 0.11) {
    warnings.push(warning("POSE_TOO_ROTATED", "fatal", "Face is too rotated", "Use a straight-on photo for accurate scoring."));
  } else if (rollDeg > 8 || yawProxy > 0.075) {
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
    warnings,
  };
}
