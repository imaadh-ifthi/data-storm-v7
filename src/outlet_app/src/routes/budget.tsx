import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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

import * as Tabs from "@radix-ui/react-tabs";

import { getOutletPage } from "@/lib/api/outlet-data.functions";
import { formatNumber } from "@/lib/formatters";
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
type BreakdownTab = "type" | "size" | "tier" | "band";

function Budget() {
  const [activeTab, setActiveTab] = useState<BreakdownTab>("type");
  const [sortKey, setSortKey] = useState<SortKey>("trade_spend_lkr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [queryTail, setQueryTail] = useState("");
  const [searchInput, setSearchInput] = useState("OUT_");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const query = `OUT_${queryTail}`;

  const handleSearch = () => {
    if (!searchInput.toUpperCase().startsWith("OUT_")) {
      setQueryTail(searchInput.replace(/^OUT_/i, ""));
    } else {
      setQueryTail(searchInput.slice(4));
    }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["budget-page", sortKey, sortDir, page, query],
    queryFn: () =>
      getOutletPage({
        fundedOnly: true,
        query,
        limit: pageSize,
        offset: page * pageSize,
        sortKey,
        sortDir,
      }),
  });

  useEffect(() => {
    setPage(0);
  }, [sortKey, sortDir, query]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    
    switch (activeTab) {
      case "type":
        return (data.type_breakdown ?? []).map((row) => ({
          label: row.outlet_type,
          spend: row.trade_spend_lkr,
          outlets: row.outlets,
        })).sort((a, b) => a.label.localeCompare(b.label));
      case "size":
        return (data.size_breakdown ?? []).map((row) => ({
          label: row.outlet_size,
          spend: row.trade_spend_lkr,
          outlets: row.outlets,
        })).sort((a, b) => a.label.localeCompare(b.label));
      case "tier":
        return (data.tier_breakdown ?? []).map((row) => ({
          label: row.capacity_tier,
          spend: row.trade_spend_lkr,
          outlets: row.outlets,
        }));
      case "band":
        return (data.band_breakdown ?? []).map((row) => ({
          label: row.budget_band,
          spend: row.trade_spend_lkr,
          outlets: row.outlets,
        }));
    }
  }, [data?.type_breakdown, data?.size_breakdown, data?.tier_breakdown, data?.band_breakdown, activeTab]);

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
              className="text-[15px] uppercase tracking-wider"
              style={{ color: "#FFFF" }}
            >
              Funded outlets only
            </div>
          </div>
          <div className="font-mono text-2xl font-bold">
            LKR {formatNumber(totalBudget)} {" "}
            <span style={{ color: "rgba(255,255,255,0.5)" }}>
              / {formatNumber(fundedOutlets)} funded outlets
            </span>
          </div>
        </div>
        <div className="mt-2 text-s" style={{ color: "rgba(255,255,255,0.6)" }}>
          Funding analysis across outlets with trade spend allocations.
        </div>
      </section>

      {/* Distributor chart */}
      <section className="card-surface p-6">
        <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as BreakdownTab)}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne" }}>
                Allocation by {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h2>
              <p className="text-s" style={{ color: "#85756e" }}>
                Funded allocation totals grouped by outlet {activeTab}
              </p>
            </div>
            <Tabs.List className="flex rounded-md border" style={{ borderColor: "rgba(20,18,4,0.12)", backgroundColor: "#f9f9f9" }}>
              {(["type", "size", "tier", "band"] as const).map((tab) => (
                <Tabs.Trigger
                  key={tab}
                  value={tab}
                  className="px-3 py-1.5 text-xs transition-colors data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:shadow-sm"
                  style={{ color: activeTab === tab ? "#1f487e" : "#85756e" }}
                >
                  By {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>
        
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
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
                  dataKey="label"
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
                    `LKR ${formatNumber(v)} · ${formatNumber((p.payload as { outlets: number }).outlets)} outlets`,
                    "Spend",
                  ]}
                />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="spend"
                    position="right"
                    formatter={(v: number) => `LKR ${formatNumber(v)}`}
                    style={{ fontSize: 11, fill: "#141204", fontFamily: "IBM Plex Mono" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tabs.Root>
      </section>

      {/* Allocation table */}
      <section className="card-surface overflow-hidden">
        <div className="border-b p-4 flex flex-wrap items-center justify-between gap-4" style={{ borderColor: "rgba(20,18,4,0.08)" }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne" }}>
            Allocation Detail
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5" style={{ color: "#85756e" }} />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by Outlet ID…"
                className="w-72 rounded-md border bg-white py-1.5 pl-8 pr-3 text-xs outline-none"
                style={{ borderColor: "rgba(20,18,4,0.12)" }}
              />
            </div>
            <button
              onClick={handleSearch}
              className="rounded-md bg-[#1f487e] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#1a3d6a]"
            >
              Search
            </button>
          </div>
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
                  <td className="px-4 py-3 font-mono text-s" style={{ color: "#85756e" }}>
                    {o.outlet_id}
                  </td>
                  <td className="px-4 py-3">{o.outlet_type}</td>
                  <td className="px-4 py-3 font-mono text-s">{o.outlet_size}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatNumber(o.maximum_monthly_liters)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatNumber(o.trade_spend_lkr)}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono"
                    style={{ color: efficiencyColor(o.spend_per_1000_liters) }}
                  >
                    {o.spend_per_1000_liters > 0
                      ? `LKR ${formatNumber(o.spend_per_1000_liters)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={o.capacity_tier} />
                  </td>
                  <td className="px-4 py-3 text-s" style={{ color: "#85756e" }}>
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
            className="rounded-md border bg-white px-3 py-1.5 text-s"
            style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
          >
            Previous
          </button>
          <div className="text-s" style={{ color: "#85756e" }}>
            Page {page + 1} of {totalPages} · {formatNumber(total)} funded outlets
          </div>
          <button
            onClick={() => setPage((current) => current + 1)}
            disabled={(page + 1) * pageSize >= total}
            className="rounded-md border bg-white px-3 py-1.5 text-s"
            style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
