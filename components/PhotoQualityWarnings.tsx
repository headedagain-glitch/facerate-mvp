import type { PhotoWarning } from "@/types/face";

export default function PhotoQualityWarnings({ warnings }: { warnings: PhotoWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Photo quality warnings</h3>
      <ul className="space-y-2">
        {warnings.map((warning) => (
          <li
            key={`${warning.code}-${warning.severity}`}
            className={
              warning.severity === "fatal"
                ? "rounded-md border border-coral/35 bg-coral/10 px-3 py-2 text-sm leading-5 text-coral"
                : "rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-sm leading-5 text-amber"
            }
          >
            <strong>{warning.label}:</strong> {warning.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
