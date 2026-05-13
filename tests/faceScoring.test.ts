import { describe, expect, it } from "vitest";
import { calculateFaceMetrics } from "@/lib/metrics";
import { cropLaplacianVariance } from "@/lib/photoQuality";
import type { FaceBlendshapeMap, FaceDetectionPayload, NormalizedLandmark } from "@/types/face";

function makeLandmarks(overrides: Record<number, Partial<NormalizedLandmark>> = {}): NormalizedLandmark[] {
  const landmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const base: Record<number, NormalizedLandmark> = {
    10: { x: 0.5, y: 0.12 },
    152: { x: 0.5, y: 0.88 },
    234: { x: 0.24, y: 0.5 },
    454: { x: 0.76, y: 0.5 },
    172: { x: 0.34, y: 0.78 },
    397: { x: 0.66, y: 0.78 },
    33: { x: 0.38, y: 0.38 },
    133: { x: 0.46, y: 0.38 },
    159: { x: 0.42, y: 0.365 },
    145: { x: 0.42, y: 0.395 },
    263: { x: 0.62, y: 0.38 },
    362: { x: 0.54, y: 0.38 },
    386: { x: 0.58, y: 0.365 },
    374: { x: 0.58, y: 0.395 },
    70: { x: 0.39, y: 0.33 },
    300: { x: 0.61, y: 0.33 },
    105: { x: 0.45, y: 0.33 },
    334: { x: 0.55, y: 0.33 },
    9: { x: 0.5, y: 0.32 },
    168: { x: 0.5, y: 0.42 },
    1: { x: 0.5, y: 0.6 },
    2: { x: 0.5, y: 0.64 },
    98: { x: 0.46, y: 0.64 },
    327: { x: 0.54, y: 0.64 },
    61: { x: 0.42, y: 0.72 },
    291: { x: 0.58, y: 0.72 },
    13: { x: 0.5, y: 0.715 },
    14: { x: 0.5, y: 0.722 },
    0: { x: 0.5, y: 0.705 },
    17: { x: 0.5, y: 0.735 },
  };

  Object.entries(base).forEach(([index, point]) => {
    landmarks[Number(index)] = point;
  });

  Object.entries(overrides).forEach(([index, override]) => {
    landmarks[Number(index)] = {
      ...landmarks[Number(index)],
      ...override,
    };
  });

  return landmarks;
}

function detection(
  landmarks: NormalizedLandmark[] | null,
  faceCount = landmarks ? 1 : 0,
  blendshapes: FaceBlendshapeMap = {},
  transformationMatrix?: number[],
): FaceDetectionPayload {
  return {
    faceCount,
    landmarks,
    blendshapes,
    transformationMatrix,
  };
}

const imageParams = {
  imageWidth: 1200,
  imageHeight: 1200,
  photoQualityOverrides: {
    minSide: 1200,
    blurVariance: 320,
    meanLuminance: 130,
    luminanceStd: 60,
    lightingDiff: 0.05,
  },
};

function score(payload: FaceDetectionPayload, overrides = {}) {
  return calculateFaceMetrics({
    detection: payload,
    ...imageParams,
    photoQualityOverrides: {
      ...imageParams.photoQualityOverrides,
      ...overrides,
    },
  });
}

function yawMatrix(degrees: number): number[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [cos, 0, sin, 0, 0, 1, 0, 0, -sin, 0, cos, 0, 0, 0, 0, 1];
}

function grayWithFaceCrop({
  cleanFace,
  size = 160,
  xMin = 48,
  xMax = 111,
  yMin = 36,
  yMax = 127,
}: {
  cleanFace: boolean;
  size?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}) {
  const gray = new Uint8ClampedArray(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inFaceCrop = x >= xMin && x <= xMax && y >= yMin && y <= yMax;
      const sharpValue = (x + y) % 2 === 0 ? 25 : 230;
      gray[y * size + x] = inFaceCrop && !cleanFace ? 128 : sharpValue;
    }
  }

  return {
    gray,
    size,
    xMin,
    xMax,
    yMin,
    yMax,
  };
}

describe("FaceRate gated scoring", () => {
  it("scores a high-quality neutral frontal face with high confidence", () => {
    const result = score(detection(makeLandmarks()));
    expect(result.retakeRequired).toBe(false);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
    expect(result.photoQualityScore).toBeGreaterThanOrEqual(85);
    expect(result.poseScore).toBeGreaterThanOrEqual(85);
    expect(result.expressionNeutralityScore).toBeGreaterThanOrEqual(85);
    expect(result.finalAestheticBalanceScore).not.toBeNull();
    expect(result.warnings.some((warning) => warning.severity === "fatal")).toBe(false);
  });

  it("requires retake for blurry images", () => {
    const result = score(detection(makeLandmarks()), { blurVariance: 40 });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "BLURRY_IMAGE", severity: "fatal" })]));
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("requires retake for open-mouth exaggerated faces", () => {
    const result = score(detection(makeLandmarks({ 14: { y: 0.76 } }), 1, { jawOpen: 0.24 }));
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OPEN_MOUTH", severity: "fatal" })]));
    expect(result.expressionNeutralityScore).toBeLessThan(50);
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("requires retake for side-turned faces", () => {
    const result = score(detection(makeLandmarks({ 1: { x: 0.62 } })));
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POSE_TOO_ROTATED", severity: "fatal" })]));
    expect(result.poseScore).toBeLessThan(50);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("detects side turns when nose landmarks are aligned but eye widths are asymmetric", () => {
    const result = score(
      detection(
        makeLandmarks({
          168: { x: 0.5 },
          1: { x: 0.5 },
          152: { x: 0.5 },
          362: { x: 0.58 },
        }),
      ),
    );

    expect(result.debugMetrics.eyeWidthAsymmetry).toBeGreaterThan(0.24);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POSE_TOO_ROTATED" })]));
  });

  it("caps mild side-turn warnings below 80", () => {
    const result = score(detection(makeLandmarks({ 1: { x: 0.55 } })));
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POSE_TOO_ROTATED", severity: "warning" })]));
    expect(result.retakeRequired).toBe(false);
    expect(result.finalAestheticBalanceScore).not.toBeNull();
    expect(result.finalAestheticBalanceScore ?? 0).toBeLessThanOrEqual(79);
  });

  it("uses transformation matrix yaw above 15 degrees as a fatal pose gate", () => {
    const result = score(detection(makeLandmarks(), 1, {}, yawMatrix(18)));

    expect(result.debugMetrics.usedTransformationMatrix).toBe(true);
    expect(result.debugMetrics.matrixYawDeg).toBeCloseTo(18, 1);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POSE_TOO_ROTATED", severity: "fatal" })]));
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("caps transformation matrix yaw warnings between 9 and 15 degrees below 80", () => {
    const result = score(detection(makeLandmarks(), 1, {}, yawMatrix(12)));

    expect(result.debugMetrics.usedTransformationMatrix).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POSE_TOO_ROTATED", severity: "warning" })]));
    expect(result.retakeRequired).toBe(false);
    expect(result.finalAestheticBalanceScore).not.toBeNull();
    expect(result.finalAestheticBalanceScore ?? 0).toBeLessThanOrEqual(79);
  });

  it("requires retake for off-center faces", () => {
    const result = score(detection(makeLandmarks()), { centerDistance: 0.25 });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FACE_OFF_CENTER", severity: "fatal" })]));
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("requires retake for multiple faces", () => {
    const result = score(detection(null, 2));
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MULTIPLE_FACES", severity: "fatal" })]));
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("requires retake for cropped faces", () => {
    const result = score(detection(makeLandmarks({ 10: { y: 0.005 } })));
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FACE_TOO_LARGE_OR_CROPPED", severity: "fatal" })]),
    );
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("requires retake for low-light faces", () => {
    const result = score(detection(makeLandmarks()), { meanLuminance: 35 });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LOW_LIGHT", severity: "fatal" })]));
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("requires retake when no face is detected", () => {
    const result = score(detection(null, 0));
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "NO_FACE", severity: "fatal" })]));
    expect(result.retakeRequired).toBe(true);
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("uses the face crop for blur so a sharp background cannot hide a blurry face", () => {
    const crop = grayWithFaceCrop({ cleanFace: false });
    const faceCropBlur = cropLaplacianVariance(crop.gray, crop.size, crop.xMin, crop.xMax, crop.yMin, crop.yMax);
    const result = score(detection(makeLandmarks()), { blurVariance: faceCropBlur });

    expect(faceCropBlur).toBeLessThan(60);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "BLURRY_IMAGE", severity: "fatal" })]));
    expect(result.finalAestheticBalanceScore).toBeNull();
  });

  it("does not mark a clean face crop blurry with the same sharp background", () => {
    const crop = grayWithFaceCrop({ cleanFace: true });
    const faceCropBlur = cropLaplacianVariance(crop.gray, crop.size, crop.xMin, crop.xMax, crop.yMin, crop.yMax);
    const result = score(detection(makeLandmarks()), { blurVariance: faceCropBlur });

    expect(faceCropBlur).toBeGreaterThanOrEqual(120);
    expect(result.warnings.some((warning) => warning.code === "BLURRY_IMAGE")).toBe(false);
    expect(result.retakeRequired).toBe(false);
  });

  it("keeps normal selfies with warnings below 80", () => {
    const result = score(detection(makeLandmarks({ 1: { x: 0.55 } })), { blurVariance: 130 });
    expect(result.retakeRequired).toBe(false);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(result.confidenceScore).toBeLessThanOrEqual(85);
    expect(result.finalAestheticBalanceScore ?? 0).toBeLessThanOrEqual(79);
  });
});
