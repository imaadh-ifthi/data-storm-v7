import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { getOutletPage } from "@/lib/api/outlet-data.functions";
import { TierBadge } from "@/components/TierBadge";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget Allocation · Outlet Intelligence" },
      { name: "description", content: "Western Province promotional budget allocation." },
    ],
  }),
  component: Budget,
});

type SortKey = "trade_spend_lkr" | "spend_per_1000_liters";

function Budget() {
  const [sortKey, setSortKey] = useState<SortKey>("trade_spend_lkr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const pageSize = 200;

  const { data, isLoading, error } = useQuery({
    queryKey: ["budget-page", sortKey, sortDir, page],
    queryFn: () =>
      getOutletPage({
        fundedOnly: true,
        limit: pageSize,
        offset: page * pageSize,
        sortKey,
        sortDir,
      }),
  });

  useEffect(() => {
    setPage(0);
  }, [sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const distAgg = useMemo(() => {
    return (data?.type_breakdown ?? [])
      .map((row) => ({
        distributor: row.outlet_type,
        spend: row.trade_spend_lkr,
        outlets: row.outlets,
      }))
      .sort((a, b) => a.distributor.localeCompare(b.distributor));
  }, [data?.type_breakdown]);

  const COLORS = ["#1f487e", "#86bbbd", "#91c499"];
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalBudget = data?.summary?.total_budget_lkr ?? 0;
  const fundedOutlets = data?.summary?.total_outlets ?? 0;

  const efficiencyColor = (v: number) =>
    v <= 1000 ? "#91c499" : v <= 2500 ? "#86bbbd" : "#85756e";

  if (isLoading) {
    return (
      <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8">
        <div className="card-surface p-8 text-sm" style={{ color: "#85756e" }}>
          Loading funded budget view…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8">
        <div className="card-surface p-8 text-sm" style={{ color: "#85756e" }}>
          Failed to load the funded budget view.
        </div>
      </main>
    );
  }

  return (
    <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
      {/* Banner */}
      <section className="rounded-lg p-6" style={{ backgroundColor: "#141204", color: "#ffffff" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "rgba(134,187,189,0.7)" }}
            >
              Funded outlets only
            </div>
          </div>
          <div className="font-mono text-2xl font-bold">
            LKR {totalBudget.toLocaleString()} {" "}
            <span style={{ color: "rgba(255,255,255,0.5)" }}>
              / {fundedOutlets.toLocaleString()} funded outlets
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          Funding analysis across outlets with trade spend allocations.
        </div>
      </section>

      {/* Distributor chart */}
      <section className="card-surface p-6">
        <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne" }}>
          Allocation by Outlet Type
        </h2>
        <p className="text-xs" style={{ color: "#85756e" }}>
          Funded allocation totals grouped by outlet type
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={distAgg}
              layout="vertical"
              margin={{ top: 8, right: 80, bottom: 8, left: 16 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#85756e", fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="distributor"
                type="category"
                tick={{ fontSize: 11, fill: "#141204", fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
                width={100}
              />
              <Tooltip
                cursor={{ fill: "rgba(31,72,126,0.04)" }}
                contentStyle={{
                  background: "#fff",
                  border: "0.5px solid rgba(20,18,4,0.12)",
                  fontSize: 12,
                  fontFamily: "IBM Plex Mono",
                }}
                formatter={(v: number, _n, p) => [
                  `LKR ${v.toLocaleString()} · ${(p.payload as { outlets: number }).outlets} outlets`,
                  "Spend",
                ]}
              />
              <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                {distAgg.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
                <LabelList
                  dataKey="spend"
                  position="right"
                  formatter={(v: number) => `LKR ${v.toLocaleString()}`}
                  style={{ fontSize: 11, fill: "#141204", fontFamily: "IBM Plex Mono" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Allocation table */}
      <section className="card-surface overflow-hidden">
        <div className="border-b p-4" style={{ borderColor: "rgba(20,18,4,0.08)" }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne" }}>
            Allocation Detail
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-[11px] uppercase tracking-wider"
                style={{ color: "#85756e", borderBottom: "0.5px solid rgba(20,18,4,0.12)" }}
              >
                <th className="px-4 py-3 font-medium">Outlet ID</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 text-right font-medium">Max Monthly Liters</th>
                <th
                  className="px-4 py-3 text-right font-medium cursor-pointer"
                  onClick={() => toggleSort("trade_spend_lkr")}
                >
                  Trade Spend (LKR){" "}
                  {sortKey === "trade_spend_lkr" && (sortDir === "desc" ? "↓" : "↑")}
                </th>
                <th
                  className="px-4 py-3 text-right font-medium cursor-pointer"
                  onClick={() => toggleSort("spend_per_1000_liters")}
                >
                  Spend / 1kL{" "}
                  {sortKey === "spend_per_1000_liters" && (sortDir === "desc" ? "↓" : "↑")}
                </th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Band</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.outlet_id} style={{ borderBottom: "0.5px solid rgba(20,18,4,0.08)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "#85756e" }}>
                    {o.outlet_id}
                  </td>
                  <td className="px-4 py-3">{o.outlet_type}</td>
                  <td className="px-4 py-3 font-mono text-xs">{o.outlet_size}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {o.maximum_monthly_liters.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {o.trade_spend_lkr.toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono"
                    style={{ color: efficiencyColor(o.spend_per_1000_liters) }}
                  >
                    {o.spend_per_1000_liters > 0
                      ? `LKR ${o.spend_per_1000_liters.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={o.capacity_tier} />
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "#85756e" }}>
                    {o.budget_band}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#85756e" }}
                  >
                    No funded outlets match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
            className="rounded-md border bg-white px-3 py-1.5 text-xs"
            style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
          >
            Previous
          </button>
          <div className="text-xs" style={{ color: "#85756e" }}>
            Page {page + 1} of {totalPages} · {total.toLocaleString()} funded outlets
          </div>
          <button
            onClick={() => setPage((current) => current + 1)}
            disabled={(page + 1) * pageSize >= total}
            className="rounded-md border bg-white px-3 py-1.5 text-xs"
            style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
