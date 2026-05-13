import { average, bandScore, clamp, maxOnlyScore } from "@/lib/scoringUtils";
import type { NormalizedLandmark, PhotoWarning } from "@/types/face";

export type LandmarkBoundingBox = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type PhotoQualityStats = {
  minSide: number;
  blurVariance: number;
  meanLuminance: number;
  luminanceStd: number;
  lightingDiff: number;
  faceWidthNorm: number;
  faceHeightNorm: number;
  centerDistance: number;
  minMargin: number;
};

export type PhotoQualityResult = PhotoQualityStats & {
  photoQualityScore: number;
  resolutionScore: number;
  blurScore: number;
  brightnessContrastScore: number;
  lightingEvennessScore: number;
  centerAlignmentScore: number;
  faceSizeScore: number;
  warnings: PhotoWarning[];
  bbox: LandmarkBoundingBox;
};

export type PhotoQualityOverrides = Partial<PhotoQualityStats>;

type ImageLike = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

function warning(code: PhotoWarning["code"], severity: PhotoWarning["severity"], label: string, detail: string): PhotoWarning {
  return { code, severity, label, detail };
}

export function getLandmarkBoundingBox(landmarks: NormalizedLandmark[]): LandmarkBoundingBox {
  const xs = landmarks.map((landmark) => landmark.x).filter(Number.isFinite);
  const ys = landmarks.map((landmark) => landmark.y).filter(Number.isFinite);

  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

export function laplacianVariance(gray: Uint8ClampedArray, width: number, height: number): number {
  const values: number[] = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = gray[i - width] + gray[i - 1] - 4 * gray[i] + gray[i + 1] + gray[i + width];
      values.push(lap);
    }
  }

  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function defaultImageStats(): Pick<PhotoQualityStats, "blurVariance" | "meanLuminance" | "luminanceStd" | "lightingDiff"> {
  return {
    blurVariance: 240,
    meanLuminance: 130,
    luminanceStd: 60,
    lightingDiff: 0.08,
  };
}

function sampleImageStats(image: ImageLike | undefined, bbox: LandmarkBoundingBox): Pick<PhotoQualityStats, "blurVariance" | "meanLuminance" | "luminanceStd" | "lightingDiff"> {
  if (!image || typeof document === "undefined") {
    return defaultImageStats();
  }

  const canvas = document.createElement("canvas");
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return defaultImageStats();

  try {
    ctx.drawImage(image, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const gray = new Uint8ClampedArray(size * size);
    const lumas: number[] = [];
    const leftLumas: number[] = [];
    const rightLumas: number[] = [];
    const xMin = Math.max(0, Math.floor((bbox.xMin - 0.04) * size));
    const xMax = Math.min(size - 1, Math.ceil((bbox.xMax + 0.04) * size));
    const yMin = Math.max(0, Math.floor((bbox.yMin - 0.04) * size));
    const yMax = Math.min(size - 1, Math.ceil((bbox.yMax + 0.04) * size));
    const centerX = (xMin + xMax) / 2;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const value = luminance(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2]);
        gray[y * size + x] = value;

        if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
          lumas.push(value);
          if (x < centerX) leftLumas.push(value);
          else rightLumas.push(value);
        }
      }
    }

    const meanLuminance = average(lumas);
    const luminanceStd = Math.sqrt(average(lumas.map((value) => (value - meanLuminance) ** 2)));
    const leftMean = average(leftLumas);
    const rightMean = average(rightLumas);
    const lightingDiff = Math.abs(leftMean - rightMean) / Math.max(1, meanLuminance);

    return {
      blurVariance: laplacianVariance(gray, size, size),
      meanLuminance,
      luminanceStd,
      lightingDiff,
    };
  } catch {
    return defaultImageStats();
  }
}

export function calculatePhotoQuality({
  landmarks,
  image,
  imageWidth,
  imageHeight,
  overrides = {},
}: {
  landmarks: NormalizedLandmark[];
  image?: ImageLike;
  imageWidth: number;
  imageHeight: number;
  overrides?: PhotoQualityOverrides;
}): PhotoQualityResult {
  const bbox = getLandmarkBoundingBox(landmarks);
  const imageStats = sampleImageStats(image, bbox);
  const faceWidthNorm = bbox.xMax - bbox.xMin;
  const faceHeightNorm = bbox.yMax - bbox.yMin;
  const centerDistance = Math.hypot((bbox.xMin + bbox.xMax) / 2 - 0.5, (bbox.yMin + bbox.yMax) / 2 - 0.5);
  const minMargin = Math.min(bbox.xMin, bbox.yMin, 1 - bbox.xMax, 1 - bbox.yMax);
  const stats: PhotoQualityStats = {
    minSide: Math.min(imageWidth, imageHeight),
    blurVariance: imageStats.blurVariance,
    meanLuminance: imageStats.meanLuminance,
    luminanceStd: imageStats.luminanceStd,
    lightingDiff: imageStats.lightingDiff,
    faceWidthNorm,
    faceHeightNorm,
    centerDistance,
    minMargin,
    ...overrides,
  };

  const warnings: PhotoWarning[] = [];

  if (stats.minSide < 512) {
    warnings.push(warning("IMAGE_TOO_SMALL", "fatal", "Image is too small", "Use a photo with at least 512 px on the shortest side."));
  } else if (stats.minSide < 720) {
    warnings.push(warning("IMAGE_TOO_SMALL", "warning", "Image resolution is limited", "A larger photo improves landmark stability."));
  }

  if (stats.blurVariance < 60) {
    warnings.push(warning("BLURRY_IMAGE", "fatal", "Image is too blurry", "Retake with a sharper, focused photo."));
  } else if (stats.blurVariance < 120) {
    warnings.push(warning("BLURRY_IMAGE", "warning", "Image may be slightly blurry", "A sharper photo will improve confidence."));
  }

  if (stats.meanLuminance < 45) {
    warnings.push(warning("LOW_LIGHT", "fatal", "Lighting is too low", "Use brighter, even front lighting."));
  } else if (stats.meanLuminance < 70) {
    warnings.push(warning("LOW_LIGHT", "warning", "Lighting is dim", "Brighter front lighting improves confidence."));
  }

  if (stats.meanLuminance > 235) {
    warnings.push(warning("OVEREXPOSED", "fatal", "Image is overexposed", "Reduce brightness so facial landmarks remain visible."));
  } else if (stats.meanLuminance > 215) {
    warnings.push(warning("OVEREXPOSED", "warning", "Image may be overexposed", "Avoid harsh light or blown-out highlights."));
  }

  if (stats.lightingDiff > 0.38) {
    warnings.push(warning("UNEVEN_LIGHTING", "fatal", "Lighting is too uneven", "Use more even lighting across both sides of the face."));
  } else if (stats.lightingDiff > 0.25) {
    warnings.push(warning("UNEVEN_LIGHTING", "warning", "Lighting is uneven", "A more evenly lit photo improves confidence."));
  }

  if (stats.faceHeightNorm < 0.35 || stats.faceWidthNorm < 0.25) {
    warnings.push(warning("FACE_TOO_SMALL", "fatal", "Face is too small", "Crop closer while keeping the full face visible."));
  }

  if (stats.faceHeightNorm > 0.94 || stats.faceWidthNorm > 0.88 || stats.minMargin < 0.015) {
    warnings.push(warning("FACE_TOO_LARGE_OR_CROPPED", "fatal", "Face appears cropped", "Keep the forehead, jaw, and side contours fully visible."));
  }

  if (stats.centerDistance > 0.2) {
    warnings.push(warning("FACE_OFF_CENTER", "fatal", "Face is off-center", "Center the face in the frame."));
  } else if (stats.centerDistance > 0.12) {
    warnings.push(warning("FACE_OFF_CENTER", "warning", "Face is slightly off-center", "Centering the face improves confidence."));
  }

  const resolutionScore = bandScore(stats.minSide, 720, 2000, 512, 2600);
  const blurScore = bandScore(stats.blurVariance, 120, 1000, 60, 1200);
  const brightnessScore = bandScore(stats.meanLuminance, 85, 180, 45, 235);
  const contrastScore = bandScore(stats.luminanceStd, 45, 95, 25, 130);
  const brightnessContrastScore = 0.6 * brightnessScore + 0.4 * contrastScore;
  const lightingEvennessScore = maxOnlyScore(stats.lightingDiff, 0.18, 0.38);
  const centerAlignmentScore = maxOnlyScore(stats.centerDistance, 0.06, 0.2);
  const faceSizeScore =
    0.6 * bandScore(stats.faceHeightNorm, 0.55, 0.82, 0.35, 0.94) +
    0.4 * bandScore(stats.faceWidthNorm, 0.38, 0.7, 0.25, 0.88);

  const photoQualityScore = clamp(
    0.25 * blurScore +
      0.2 * brightnessContrastScore +
      0.15 * resolutionScore +
      0.2 * faceSizeScore +
      0.1 * centerAlignmentScore +
      0.1 * lightingEvennessScore,
  );

  return {
    ...stats,
    photoQualityScore,
    resolutionScore,
    blurScore,
    brightnessContrastScore,
    lightingEvennessScore,
    centerAlignmentScore,
    faceSizeScore,
    warnings,
    bbox,
  };
}
