import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { getOutletPage } from "@/lib/api/outlet-data.functions";
import { formatNumber } from "@/lib/formatters";
import { KpiCard } from "@/components/KpiCard";
import { TierBadge } from "@/components/TierBadge";
import { OutletDetail } from "@/components/OutletDetail";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Outlet Intelligence" },
      { name: "description", content: "Outlet potential predictions and capacity tiers." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [outletType, setOutletType] = useState("All");
  const [outletSize, setOutletSize] = useState("All");
  const [outletTier, setOutletTier] = useState("All");
  const [queryTail, setQueryTail] = useState("");
  const [searchInput, setSearchInput] = useState("OUT_");
  const [sortKey, setSortKey] = useState<"maximum_monthly_liters">("maximum_monthly_liters");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openId, setOpenId] = useState<string | null>(null);
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
    queryKey: ["outlet-page", outletType, outletSize, outletTier, query, sortKey, sortDir, page],
    queryFn: () =>
      getOutletPage({
        outletType,
        outletSize,
        outletTier,
        query,
        limit: pageSize,
        offset: page * pageSize,
        sortKey,
        sortDir,
      }),
  });

  useEffect(() => {
    setPage(0);
    setOpenId(null);
  }, [outletType, outletSize, outletTier, query, sortKey, sortDir]);

  const rows = data?.rows ?? [];
  const outletTypes = data?.outlet_types ?? [];
  const outletSizes = data?.outlet_sizes ?? [];
  const metrics = data?.metrics;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const avgPotential = metrics?.avg_maximum_monthly_liters ?? 0;
  const highCount = metrics?.high_tier_outlets ?? 0;

  if (isLoading) {
    return (
      <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8">
        <div className="card-surface p-8 text-sm" style={{ color: "#85756e" }}>
          Loading CSV-backed outlet dataset…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8">
        <div className="card-surface p-8 text-sm" style={{ color: "#85756e" }}>
          Failed to load the CSV-backed outlet dataset.
        </div>
      </main>
    );
  }

  return (
    <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8">
      {/* Filter bar */}
      <div className="card-surface mb-6 flex flex-wrap items-center gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...outletTypes] as const).map((type) => {
            const active = outletType === type;
            return (
              <button
                key={type}
                onClick={() => setOutletType(type)}
                className="rounded-full px-3.5 py-1.5 text-xs transition-colors"
                style={{
                  backgroundColor: active ? "#1f487e" : "#ffffff",
                  color: active ? "#ffffff" : "#85756e",
                  border: active ? "0.5px solid #1f487e" : "0.5px solid rgba(20,18,4,0.12)",
                }}
              >
                {type}
              </button>
            );
          })}
        </div>

        <select
          value={outletSize}
          onChange={(e) => setOutletSize(e.target.value)}
          className="rounded-md border bg-white px-3 py-1.5 text-xs font-mono"
          style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
        >
          <option value="All">All Sizes</option>
          {outletSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>

        <select
          value={outletTier}
          onChange={(e) => setOutletTier(e.target.value)}
          className="rounded-md border bg-white px-3 py-1.5 text-xs font-mono"
          style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
        >
          <option value="All">All Tiers</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <button
          onClick={() => setSortDir((current) => (current === "asc" ? "desc" : "asc"))}
          className="rounded-md border bg-white px-3 py-1.5 text-xs font-mono"
          style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
        >
          Max Liters {sortDir === "desc" ? "↓" : "↑"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5" style={{ color: "#85756e" }} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by Outlet ID or type…"
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

      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Total Outlets" value={formatNumber(total)} />
        <KpiCard
          label="Avg Max Monthly Liters"
          value={`${formatNumber(avgPotential)} L`}
          hint="per outlet"
        />
        <KpiCard label="High-Tier Outlets" value={formatNumber(highCount)} accent />
      </div>

      {/* Table */}
      <div className="card-surface overflow-hidden">
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
                <th className="px-4 py-3 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const isOpen = openId === o.outlet_id;
                return (
                  <Fragment key={o.outlet_id}>
                    <tr
                      onClick={() => setOpenId(isOpen ? null : o.outlet_id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        backgroundColor: isOpen ? "rgba(31,72,126,0.06)" : "transparent",
                        borderBottom: "0.5px solid rgba(20,18,4,0.08)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isOpen) e.currentTarget.style.backgroundColor = "rgba(31,72,126,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isOpen) e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "#85756e" }}>
                        {o.outlet_id}
                      </td>
                      <td className="px-4 py-3">{o.outlet_type}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "#85756e" }}>
                        {o.outlet_size}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono font-semibold"
                        style={{ color: "#1f487e" }}
                      >
                        {formatNumber(o.maximum_monthly_liters)}
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={o.capacity_tier} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="px-4 pb-4">
                          <OutletDetail outlet={o} showFunding={false} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {total === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm"
                    style={{ color: "#85756e" }}
                  >
                    No outlets match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
            className="rounded-md border bg-white px-3 py-1.5 text-xs"
            style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
          >
            Previous
          </button>
          <div className="text-xs" style={{ color: "#85756e" }}>
            Page {page + 1} of {totalPages} · {formatNumber(total)} outlets
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
