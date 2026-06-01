import type { Outlet } from "@/lib/outlets-data";
import { TierBadge } from "@/components/TierBadge";

function fmt(n: number) {
  return n.toLocaleString();
}

function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: "rgba(20,18,4,0.06)" }}
    >
      <div
        className="h-full"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(90deg, #86bbbd 0%, #1f487e 100%)",
        }}
      />
    </div>
  );
}

function bandStyles(band: Outlet["budget_band"]) {
  switch (band) {
    case "Priority":
      return { bg: "rgba(145,196,153,0.18)", fg: "#2a6e35" };
    case "Core":
      return { bg: "rgba(134,187,189,0.18)", fg: "#2a6c6e" };
    case "Seed":
      return { bg: "rgba(31,72,126,0.12)", fg: "#1f487e" };
    default:
      return { bg: "rgba(133,117,110,0.14)", fg: "#5a4e49" };
  }
}

export function OutletDetail({
  outlet,
  showFunding = true,
}: {
  outlet: Outlet;
  showFunding?: boolean;
}) {
  const band = bandStyles(outlet.budget_band);

  return (
    <div
      className="card-surface fade-in mt-3 grid gap-8 p-6 md:grid-cols-2"
      style={{ borderLeft: "3px solid #1f487e" }}
    >
      {/* LEFT */}
      <div className="space-y-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
            Outlet metadata
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-xs" style={{ color: "#85756e" }}>
                ID
              </span>
              <div className="font-mono">{outlet.outlet_id}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: "#85756e" }}>
                Type
              </span>
              <div>{outlet.outlet_type}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: "#85756e" }}>
                Size
              </span>
              <div>{outlet.outlet_size}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: "#85756e" }}>
                Coolers
              </span>
              <div className="font-mono">{outlet.cooler_count}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: "#85756e" }}>
                Capacity tier
              </span>
              <div>
                <TierBadge tier={outlet.capacity_tier} />
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-xs" style={{ color: "#85756e" }}>
                Coordinates
              </span>
              <div className="font-mono text-xs">
                {outlet.latitude == null || outlet.longitude == null
                  ? "—"
                  : `${outlet.latitude.toFixed(4)}, ${outlet.longitude.toFixed(4)}`}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
            Monthly capacity
          </div>
          <div className="mt-3 relative">
            <div
              className="h-3 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "rgba(20,18,4,0.06)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, (outlet.maximum_monthly_liters / 2500) * 100)}%`,
                  backgroundColor: "#1f487e",
                }}
              />
            </div>
            <div
              className="mt-1 flex justify-between text-xs font-mono"
              style={{ color: "#85756e" }}
            >
              <span>0L</span>
              <span style={{ color: "#1f487e", fontWeight: 600 }}>
                {fmt(outlet.maximum_monthly_liters)}L
              </span>
              <span>2,500L</span>
            </div>
          </div>
        </div>

        {showFunding && (
          <div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
              Trade spend intensity
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span>Spend vs. LKR 10,000 ceiling</span>
                  <span className="font-mono" style={{ color: "#1f487e" }}>
                    {outlet.trade_spend_lkr.toLocaleString()} LKR
                  </span>
                </div>
                <Bar value={outlet.trade_spend_lkr} max={10000} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span>Allocation share of total budget</span>
                  <span className="font-mono" style={{ color: "#1f487e" }}>
                    {outlet.allocation_share_pct.toFixed(2)}%
                  </span>
                </div>
                <Bar
                  value={outlet.allocation_share_pct}
                  max={Math.max(1, outlet.allocation_share_pct * 4)}
                />
              </div>
            </div>
          </div>
        )}

        {showFunding && (
          <div
            className="inline-block rounded-md px-3 py-2 text-xs font-mono"
            style={{ backgroundColor: "rgba(20,18,4,0.04)", color: "#141204" }}
          >
            {outlet.budget_band} budget band
          </div>
        )}
      </div>

      {/* RIGHT */}
      {showFunding ? (
        <div className="space-y-4">
          <div
            className="card-surface p-5"
            style={{ borderLeft: "3px solid #91c499", boxShadow: "none" }}
          >
            <div
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "#85756e", fontFamily: "Syne" }}
            >
              CSV-backed summary
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#141204" }}>
              {outlet.summary_note}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              {
                label: "Max liters",
                value: `${fmt(outlet.maximum_monthly_liters)}L`,
                bg: "rgba(134,187,189,0.18)",
                fg: "#2a6c6e",
              },
              {
                label: "Spend / 1kL",
                value:
                  outlet.spend_per_1000_liters > 0
                    ? `LKR ${outlet.spend_per_1000_liters.toLocaleString()}`
                    : "—",
                bg: "rgba(31,72,126,0.12)",
                fg: "#1f487e",
              },
              { label: "Band", value: outlet.budget_band, bg: band.bg, fg: band.fg },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-md px-3 py-2 text-xs"
                style={{ backgroundColor: s.bg, color: s.fg }}
              >
                <span style={{ color: "#85756e" }}>{s.label}:</span>{" "}
                <span className="font-mono font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="card-surface p-5"
            style={{ borderLeft: "3px solid #1f487e", boxShadow: "none" }}
          >
            <div
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "#85756e", fontFamily: "Syne" }}
            >
              Capacity snapshot
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#141204" }}>
              This outlet is projected at {fmt(outlet.maximum_monthly_liters)} liters per month and
              sits in the {outlet.capacity_tier.toLowerCase()} capacity tier.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              {
                label: "Max liters",
                value: `${fmt(outlet.maximum_monthly_liters)}L`,
                bg: "rgba(134,187,189,0.18)",
                fg: "#2a6c6e",
              },
              {
                label: "Tier",
                value: outlet.capacity_tier,
                bg: "rgba(31,72,126,0.12)",
                fg: "#1f487e",
              },
              {
                label: "Coolers",
                value: outlet.cooler_count.toLocaleString(),
                bg: "rgba(145,196,153,0.18)",
                fg: "#2a6e35",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-md px-3 py-2 text-xs"
                style={{ backgroundColor: s.bg, color: s.fg }}
              >
                <span style={{ color: "#85756e" }}>{s.label}:</span>{" "}
                <span className="font-mono font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
