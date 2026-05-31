import type { Tier } from "@/lib/outlets-data";

const MAP: Record<Tier, { bg: string; fg: string; dot: string }> = {
  High: { bg: "rgba(145,196,153,0.2)", fg: "#2a6e35", dot: "#91c499" },
  Medium: { bg: "rgba(134,187,189,0.2)", fg: "#2a6c6e", dot: "#86bbbd" },
  Low: { bg: "rgba(133,117,110,0.15)", fg: "#5a4e49", dot: "#85756e" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const c = MAP[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
      {tier}
    </span>
  );
}
