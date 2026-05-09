export type NormalizedLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PixelPoint = {
  x: number;
  y: number;
};

export type LandmarkGroupName =
  | "jawline"
  | "cheekbones"
  | "leftEye"
  | "rightEye"
  | "leftBrow"
  | "rightBrow"
  | "nose"
  | "lips"
  | "chin";

export type LandmarkGroups = Record<LandmarkGroupName, number[]>;

export type MeasurementLineName =
  | "centerline"
  | "eyeWidthLeft"
  | "eyeWidthRight"
  | "eyeSpacing"
  | "jawWidth"
  | "mouthWidth"
  | "noseWidth"
  | "faceHeight"
  | "faceWidth"
  | "leftRightDifference";

export type MeasurementLine = {
  name: MeasurementLineName;
  label: string;
  from: PixelPoint;
  to: PixelPoint;
  tone?: "mint" | "amber" | "coral" | "neutral";
};

export type PhotoWarningCode =
  | "poor-lighting"
  | "sideways-pose"
  | "low-resolution"
  | "off-center"
  | "multiple-faces"
  | "no-face"
  | "not-ready";

export type PhotoWarning = {
  code: PhotoWarningCode;
  label: string;
  detail: string;
};

export type FaceMetrics = {
  aestheticBalanceScore: number;
  symmetryScore: number;
  leftRightBalance: number;
  faceWidthToHeightRatio: number;
  eyeSpacingRatio: number;
  jawToFaceWidthRatio: number;
  noseToFaceWidthRatio: number;
  mouthToFaceWidthRatio: number;
  cheekboneProminence: number;
  jawlineDefinition: number;
  facialThirds: {
    upper: number;
    middle: number;
    lower: number;
    balanceScore: number;
  };
  warnings: PhotoWarning[];
};

export type FaceAnalysis = {
  landmarks: NormalizedLandmark[];
  metrics: FaceMetrics;
  measurementLines: MeasurementLine[];
  analyzedAt: string;
};

export type LooksReport = {
  scoreLabel: string;
  score: number;
  summary: string;
  strongPoints: string[];
  improvementAreas: string[];
  groomingSuggestions: string[];
  photoWarnings: string[];
  disclaimer: string;
  privacyNote: string;
};
