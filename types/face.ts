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

export type PhotoWarningSeverity = "info" | "warning" | "fatal";

export type PhotoWarningCode =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "IMAGE_TOO_SMALL"
  | "FACE_TOO_SMALL"
  | "FACE_TOO_LARGE_OR_CROPPED"
  | "FACE_OFF_CENTER"
  | "BLURRY_IMAGE"
  | "LOW_LIGHT"
  | "OVEREXPOSED"
  | "UNEVEN_LIGHTING"
  | "POSE_TOO_ROTATED"
  | "OPEN_MOUTH"
  | "EXTREME_EXPRESSION"
  | "LANDMARKS_UNRELIABLE"
  | "MODEL_NOT_READY";

export type PhotoWarning = {
  code: PhotoWarningCode;
  severity: PhotoWarningSeverity;
  label: string;
  detail: string;
};

export type FaceBlendshapeMap = Record<string, number>;

export type FaceDetectionPayload = {
  faceCount: number;
  landmarks: NormalizedLandmark[] | null;
  blendshapes: FaceBlendshapeMap;
  transformationMatrix?: number[];
};

export type ScoreBand =
  | "extremely_rare"
  | "very_strong"
  | "above_average"
  | "normal_decent"
  | "average"
  | "below_average_or_poor_quality"
  | "poor_input_or_weak_geometry"
  | "not_available";

export type FaceScoreResult = {
  finalAestheticBalanceScore: number | null;
  confidenceScore: number;
  geometryScore: number;
  symmetryScore: number;
  proportionScore: number;
  jawChinBalanceScore: number;
  eyeAreaBalanceScore: number;
  noseMouthProportionalityScore: number;
  photoQualityScore: number;
  landmarkConfidenceScore: number;
  poseScore: number;
  expressionNeutralityScore: number;
  retakeRequired: boolean;
  warnings: PhotoWarning[];
  scoreBand: ScoreBand;
  debugMetrics: Record<string, number | string | boolean>;
};

export type FaceAnalysis = {
  landmarks: NormalizedLandmark[];
  metrics: FaceScoreResult;
  measurementLines: MeasurementLine[];
  analyzedAt: string;
};

export type LooksReport = {
  scoreLabel: string;
  score: number | null;
  summary: string;
  strongPoints: string[];
  improvementAreas: string[];
  groomingSuggestions: string[];
  photoWarnings: string[];
  disclaimer: string;
  privacyNote: string;
};
