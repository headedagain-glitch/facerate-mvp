"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Camera, FileImage, RefreshCcw, Trash2, UploadCloud, X } from "lucide-react";

type ImageUploaderProps = {
  imageUrl: string | null;
  isAdultConfirmed: boolean;
  onAdultConfirmedChange: (value: boolean) => void;
  onImageSelected: (url: string | null) => void;
  onReset: () => void;
};

export default function ImageUploader({
  imageUrl,
  isAdultConfirmed,
  onAdultConfirmedChange,
  onImageSelected,
  onReset,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  function selectFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCameraError("Please choose an image file.");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    onImageSelected(nextUrl);
    setCameraError(null);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  async function startCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera capture is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError("Camera permission was denied or no camera was found.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onImageSelected(URL.createObjectURL(blob));
      stopCamera();
    }, "image/png");
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Photo input</h2>
        <p className="mt-1 text-xs text-slate-400">Upload a clear adult face photo or capture one from your camera.</p>
      </div>

      <div className="space-y-4 p-4">
        <label className="flex items-start gap-3 rounded-lg border border-line bg-panelSoft p-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={isAdultConfirmed}
            onChange={(event) => onAdultConfirmedChange(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-line bg-ink accent-mint"
          />
          <span className="min-w-0">I confirm I am 18+ and the photo is of me or someone who gave consent.</span>
        </label>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed p-4 text-center transition ${
            isDragging ? "border-mint bg-mint/10" : "border-line bg-ink/45"
          } ${isAdultConfirmed ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          onClick={() => {
            if (isAdultConfirmed) inputRef.current?.click();
          }}
        >
          <input ref={inputRef} hidden type="file" accept="image/*" onChange={handleInput} disabled={!isAdultConfirmed} />
          <UploadCloud className="mx-auto h-8 w-8 text-mint" />
          <p className="mt-3 text-sm font-medium text-white">Drop a face photo here</p>
          <p className="mt-1 text-xs text-slate-400">or click to browse PNG, JPG, HEIC, or WebP files</p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!isAdultConfirmed}
            onClick={() => inputRef.current?.click()}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line bg-panelSoft px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-mint/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileImage className="h-4 w-4" />
            Upload image
          </button>
          <button
            type="button"
            disabled={!isAdultConfirmed}
            onClick={cameraActive ? stopCamera : startCamera}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line bg-panelSoft px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-mint/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cameraActive ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {cameraActive ? "Stop camera" : "Use camera"}
          </button>
        </div>

        {cameraActive ? (
          <div className="space-y-2 rounded-lg border border-line bg-ink p-2">
            <video ref={videoRef} playsInline muted className="aspect-video w-full rounded-md object-cover" />
            <button
              type="button"
              onClick={capturePhoto}
              className="focus-ring w-full rounded-md bg-mint px-3 py-2 text-sm font-semibold text-ink transition hover:bg-mint/90"
            >
              Capture photo
            </button>
          </div>
        ) : null}

        {cameraError ? <p className="rounded-md bg-coral/12 px-3 py-2 text-xs text-coral">{cameraError}</p> : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onReset}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-amber/60"
          >
            <RefreshCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            disabled={!imageUrl}
            onClick={onReset}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-coral/35 px-3 py-2 text-sm font-medium text-coral transition hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete photo
          </button>
        </div>
      </div>
    </section>
  );
}
