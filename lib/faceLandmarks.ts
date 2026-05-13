import { distance, midpoint, toPixelPoint } from "@/lib/scoringUtils";
import type {
  FaceBlendshapeMap,
  FaceDetectionPayload,
  LandmarkGroups,
  MeasurementLine,
  NormalizedLandmark,
  PhotoWarning,
  PixelPoint,
} from "@/types/face";

type MediaPipeFaceLandmarkerResult = {
  faceLandmarks?: NormalizedLandmark[][];
  faceBlendshapes?: Array<{
    categories?: Array<{ categoryName: string; score: number }>;
  }>;
  facialTransformationMatrixes?: Array<{ data?: number[] }>;
};

type MediaPipeFaceLandmarker = {
  detect: (image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) => MediaPipeFaceLandmarkerResult;
};

let landmarkerPromise: Promise<MediaPipeFaceLandmarker> | null = null;

export const FACE_LANDMARK_GROUPS: LandmarkGroups = {
  jawline: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
  cheekbones: [123, 50, 101, 205, 187, 411, 425, 330, 280, 352],
  leftEye: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  rightEye: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  leftBrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  rightBrow: [336, 296, 334, 293, 300, 276, 283, 282, 295, 285],
  nose: [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327, 331],
  lips: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  chin: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
};

export const KEY_LANDMARKS = {
  topFace: 10,
  chin: 152,
  leftFace: 234,
  rightFace: 454,
  leftJaw: 172,
  rightJaw: 397,
  leftCheek: 234,
  rightCheek: 454,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  leftEyeUpper: 159,
  leftEyeLower: 145,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  rightEyeUpper: 386,
  rightEyeLower: 374,
  leftBrow: 70,
  rightBrow: 300,
  leftBrowInner: 105,
  rightBrowInner: 334,
  noseBridge: 168,
  noseTip: 1,
  noseBase: 2,
  noseLeft: 98,
  noseRight: 327,
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 13,
  mouthBottom: 14,
  upperLipOuter: 0,
  lowerLipOuter: 17,
  browCenter: 9,
} as const;

const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const WASM_ASSET = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MEDIAPIPE_NOISY_CONSOLE_MESSAGES = ["INFO: Created TensorFlow Lite XNNPACK delegate for CPU."];

export function mapLandmarkToPixel(landmark: NormalizedLandmark, imageWidth: number, imageHeight: number): PixelPoint {
  return toPixelPoint(landmark, imageWidth, imageHeight);
}

export { distance, midpoint };

function shouldSuppressMediaPipeConsoleError(args: Parameters<typeof console.error>): boolean {
  const message = args.map((arg) => (typeof arg === "string" ? arg : "")).join(" ");
  return MEDIAPIPE_NOISY_CONSOLE_MESSAGES.some((noisyMessage) => message.includes(noisyMessage));
}

function withMediaPipeConsoleErrorFilter<T>(operation: () => T): T {
  const originalConsoleError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    if (shouldSuppressMediaPipeConsoleError(args)) return;
    originalConsoleError(...args);
  };

  try {
    return operation();
  } finally {
    console.error = originalConsoleError;
  }
}

async function withMediaPipeConsoleErrorFilterAsync<T>(operation: () => Promise<T>): Promise<T> {
  const originalConsoleError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    if (shouldSuppressMediaPipeConsoleError(args)) return;
    originalConsoleError(...args);
  };

  try {
    return await operation();
  } finally {
    console.error = originalConsoleError;
  }
}

export async function loadFaceLandmarker(): Promise<MediaPipeFaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = withMediaPipeConsoleErrorFilterAsync(async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_ASSET);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET,
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 2,
        minFaceDetectionConfidence: 0.75,
        minFacePresenceConfidence: 0.75,
        minTrackingConfidence: 0.75,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }) as Promise<MediaPipeFaceLandmarker>;
    });
  }

  return landmarkerPromise;
}

function toBlendshapeMap(result: MediaPipeFaceLandmarkerResult): FaceBlendshapeMap {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  return Object.fromEntries(categories.map((category) => [category.categoryName, category.score]));
}

export async function detectFace(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<FaceDetectionPayload> {
  const landmarker = await loadFaceLandmarker();
  const result = withMediaPipeConsoleErrorFilter(() => landmarker.detect(image));
  const faces = result.faceLandmarks ?? [];

  return {
    faceCount: faces.length,
    landmarks: faces.length === 1 ? faces[0] : null,
    blendshapes: faces.length === 1 ? toBlendshapeMap(result) : {},
    transformationMatrix: result.facialTransformationMatrixes?.[0]?.data,
  };
}

export async function detectFaceLandmarks(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<NormalizedLandmark[]> {
  const detection = await detectFace(image);

  if (detection.faceCount === 0) {
    throw new Error("NO_FACE");
  }

  if (detection.faceCount > 1) {
    throw new Error("MULTIPLE_FACES");
  }

  if (!detection.landmarks) {
    throw new Error("LANDMARKS_UNRELIABLE");
  }

  return detection.landmarks;
}

export function buildMeasurementLines(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number,
): MeasurementLine[] {
  const p = (index: number) => mapLandmarkToPixel(landmarks[index], imageWidth, imageHeight);
  const centerTop = midpoint(p(KEY_LANDMARKS.leftEyeInner), p(KEY_LANDMARKS.rightEyeInner));
  const centerBottom = p(KEY_LANDMARKS.chin);
  const noseTip = p(KEY_LANDMARKS.noseTip);
  const faceCenter = midpoint(p(KEY_LANDMARKS.leftFace), p(KEY_LANDMARKS.rightFace));
  const mirroredNose = {
    x: faceCenter.x - (noseTip.x - faceCenter.x),
    y: noseTip.y,
  };

  return [
    {
      name: "centerline",
      label: "facial symmetry centerline",
      from: { x: centerTop.x, y: p(KEY_LANDMARKS.topFace).y },
      to: centerBottom,
      tone: "mint",
    },
    {
      name: "eyeWidthLeft",
      label: "left eye width",
      from: p(KEY_LANDMARKS.leftEyeOuter),
      to: p(KEY_LANDMARKS.leftEyeInner),
      tone: "neutral",
    },
    {
      name: "eyeWidthRight",
      label: "right eye width",
      from: p(KEY_LANDMARKS.rightEyeInner),
      to: p(KEY_LANDMARKS.rightEyeOuter),
      tone: "neutral",
    },
    {
      name: "eyeSpacing",
      label: "eye spacing",
      from: p(KEY_LANDMARKS.leftEyeInner),
      to: p(KEY_LANDMARKS.rightEyeInner),
      tone: "amber",
    },
    {
      name: "jawWidth",
      label: "jaw width",
      from: p(KEY_LANDMARKS.leftJaw),
      to: p(KEY_LANDMARKS.rightJaw),
      tone: "amber",
    },
    {
      name: "mouthWidth",
      label: "mouth width",
      from: p(KEY_LANDMARKS.mouthLeft),
      to: p(KEY_LANDMARKS.mouthRight),
      tone: "neutral",
    },
    {
      name: "noseWidth",
      label: "nose width",
      from: p(KEY_LANDMARKS.noseLeft),
      to: p(KEY_LANDMARKS.noseRight),
      tone: "neutral",
    },
    {
      name: "faceHeight",
      label: "face height",
      from: p(KEY_LANDMARKS.topFace),
      to: p(KEY_LANDMARKS.chin),
      tone: "mint",
    },
    {
      name: "faceWidth",
      label: "face width",
      from: p(KEY_LANDMARKS.leftFace),
      to: p(KEY_LANDMARKS.rightFace),
      tone: "mint",
    },
    {
      name: "leftRightDifference",
      label: "left vs right side difference",
      from: noseTip,
      to: mirroredNose,
      tone: "coral",
    },
  ];
}

export function getPoseAndQualityWarnings(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number,
): PhotoWarning[] {
  const p = (index: number) => mapLandmarkToPixel(landmarks[index], imageWidth, imageHeight);
  const leftEye = midpoint(p(KEY_LANDMARKS.leftEyeOuter), p(KEY_LANDMARKS.leftEyeInner));
  const rightEye = midpoint(p(KEY_LANDMARKS.rightEyeInner), p(KEY_LANDMARKS.rightEyeOuter));
  const eyeTilt = Math.abs(leftEye.y - rightEye.y) / Math.max(1, distance(leftEye, rightEye));

  if (eyeTilt <= 0.08) return [];

  return [
    {
      code: "POSE_TOO_ROTATED",
      severity: "warning",
      label: "Face angle may affect results",
      detail: "A front-facing photo with level eyes produces a more reliable estimate.",
    },
  ];
}
