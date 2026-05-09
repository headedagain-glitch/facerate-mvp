import type {
  LandmarkGroups,
  MeasurementLine,
  NormalizedLandmark,
  PhotoWarning,
  PixelPoint,
} from "@/types/face";

type MediaPipeFaceLandmarker = {
  detect: (image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) => {
    faceLandmarks?: NormalizedLandmark[][];
  };
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
  chin: [175, 152, 200, 199, 18, 32, 262],
};

export const KEY_LANDMARKS = {
  topFace: 10,
  chin: 152,
  leftFace: 234,
  rightFace: 454,
  leftJaw: 172,
  rightJaw: 397,
  leftCheek: 123,
  rightCheek: 352,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  noseLeft: 97,
  noseRight: 326,
  noseBase: 2,
  noseTip: 1,
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 13,
  mouthBottom: 14,
  browCenter: 9,
} as const;

const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const WASM_ASSET = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MEDIAPIPE_NOISY_CONSOLE_MESSAGES = ["INFO: Created TensorFlow Lite XNNPACK delegate for CPU."];

export function mapLandmarkToPixel(
  landmark: NormalizedLandmark,
  imageWidth: number,
  imageHeight: number,
): PixelPoint {
  return {
    x: landmark.x * imageWidth,
    y: landmark.y * imageHeight,
  };
}

export function midpoint(a: PixelPoint, b: PixelPoint): PixelPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

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
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }) as Promise<MediaPipeFaceLandmarker>;
    });
  }

  return landmarkerPromise;
}

export async function detectFaceLandmarks(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<NormalizedLandmark[]> {
  const landmarker = await loadFaceLandmarker();
  const result = withMediaPipeConsoleErrorFilter(() => landmarker.detect(image));
  const faces = result.faceLandmarks ?? [];

  if (faces.length === 0) {
    throw new Error("NO_FACE");
  }

  if (faces.length > 1) {
    throw new Error("MULTIPLE_FACES");
  }

  return faces[0];
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
  const warnings: PhotoWarning[] = [];
  const p = (index: number) => mapLandmarkToPixel(landmarks[index], imageWidth, imageHeight);
  const leftEye = midpoint(p(KEY_LANDMARKS.leftEyeOuter), p(KEY_LANDMARKS.leftEyeInner));
  const rightEye = midpoint(p(KEY_LANDMARKS.rightEyeInner), p(KEY_LANDMARKS.rightEyeOuter));
  const eyeTilt = Math.abs(leftEye.y - rightEye.y) / Math.max(1, distance(leftEye, rightEye));
  const faceWidth = distance(p(KEY_LANDMARKS.leftFace), p(KEY_LANDMARKS.rightFace));
  const faceHeight = distance(p(KEY_LANDMARKS.topFace), p(KEY_LANDMARKS.chin));
  const noseOffset = Math.abs(p(KEY_LANDMARKS.noseTip).x - midpoint(p(KEY_LANDMARKS.leftFace), p(KEY_LANDMARKS.rightFace)).x);

  if (imageWidth < 640 || imageHeight < 640) {
    warnings.push({
      code: "low-resolution",
      label: "Low resolution",
      detail: "Use a larger photo for more stable landmark placement.",
    });
  }

  if (eyeTilt > 0.08 || noseOffset / Math.max(1, faceWidth) > 0.08) {
    warnings.push({
      code: "sideways-pose",
      label: "Face angle may affect results",
      detail: "A front-facing photo with level eyes produces a more reliable estimate.",
    });
  }

  if (faceWidth / imageWidth < 0.28 || faceHeight / imageHeight < 0.36) {
    warnings.push({
      code: "off-center",
      label: "Face is small or off-center",
      detail: "Crop closer around the face while keeping the full jaw and forehead visible.",
    });
  }

  return warnings;
}
