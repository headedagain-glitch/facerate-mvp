"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Eye, Lock, Sparkles } from "lucide-react";
import AnalysisReport from "@/components/AnalysisReport";
import FaceCanvas from "@/components/FaceCanvas";
import ImageUploader from "@/components/ImageUploader";
import type { FaceAnalysis } from "@/types/face";

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FaceAnalysis | null>(null);
  const [status, setStatus] = useState("Waiting for photo");
  const [isAdultConfirmed, setIsAdultConfirmed] = useState(false);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleImageSelected = useCallback((url: string | null) => {
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setAnalysis(null);
    setStatus(url ? "Photo loaded" : "Waiting for photo");
  }, []);

  const handleReset = useCallback(() => {
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAnalysis(null);
    setStatus("Waiting for photo");
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-col gap-5">
        <header className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden rounded-lg border border-line bg-panel/78 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex w-full min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mint/35 bg-mint/12">
                <Sparkles className="h-5 w-5 text-mint" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-normal text-white">FaceRate MVP</h1>
                <p className="mt-1 text-sm leading-5 text-slate-400">
                  Upload a front-facing photo and get a basic AI facial proportion analysis.
                </p>
              </div>
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-3 md:w-auto">
            <StatusPill icon={<Lock className="h-3.5 w-3.5" />} label="Local processing" />
            <StatusPill icon={<Eye className="h-3.5 w-3.5" />} label="No trait inference" />
            <StatusPill icon={<Activity className="h-3.5 w-3.5" />} label={analysis ? "Analyzed" : status} />
          </div>
        </header>

        <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <ImageUploader
              imageUrl={imageUrl}
              isAdultConfirmed={isAdultConfirmed}
              onAdultConfirmedChange={setIsAdultConfirmed}
              onImageSelected={handleImageSelected}
              onReset={handleReset}
            />

            <section className="overflow-hidden rounded-lg border border-line bg-panel p-4">
              <h2 className="text-sm font-semibold text-white">Safety boundaries</h2>
              <ul className="mt-3 space-y-2 break-words text-xs leading-5 text-slate-400">
                <li>Do not analyze children; confirmation is required before upload or camera capture.</li>
                <li>No race, ethnicity, gender identity, health, personality, or identity inference.</li>
                <li>Photos are not uploaded or stored by this app.</li>
                <li>Results are approximate and depend on pose, lighting, lens, and expression.</li>
              </ul>
            </section>
          </div>

          <FaceCanvas imageUrl={imageUrl} onAnalysis={setAnalysis} onStatusChange={setStatus} />

          <AnalysisReport analysis={analysis} status={status} />
        </div>
      </div>
    </main>
  );
}

function StatusPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-md border border-line bg-ink/35 px-2 text-center">
      <span className="text-mint">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}
