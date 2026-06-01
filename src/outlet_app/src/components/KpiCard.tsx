import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  accent,
  invert,
  hint,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  invert?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div
      className="card-surface p-5"
      style={
        invert
          ? { backgroundColor: "#1f487e", color: "#ffffff", borderColor: "#1f487e" }
          : undefined
      }
    >
      <div
        className="text-[11px] uppercase tracking-wider"
        style={{ color: invert ? "rgba(255,255,255,0.7)" : "#85756e", fontFamily: "Syne" }}
      >
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div
          className="text-2xl font-bold font-mono"
          style={{ color: invert ? "#ffffff" : "#141204" }}
        >
          {value}
        </div>
        {accent && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#91c499" }} />}
      </div>
      {hint && (
        <div
          className="mt-1 text-s"
          style={{ color: invert ? "rgba(255,255,255,0.7)" : "#85756e" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
