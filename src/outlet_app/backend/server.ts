import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadOutletDataset, type Outlet } from "./outlet-dataset";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");
const dbPath =
  process.env.OUTLET_DB_PATH ?? resolve(repoRoot, "src/outlet_app/db/outlet_data.sqlite");
const port = Number(process.env.PORT ?? 8787);

const corsHeaders = {
  "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    if (!existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}. Run: bun backend/seed-db.ts`);
    }
    db = new Database(dbPath, { readonly: true });
  }
  return db;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

function parseLimit(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 5000);
}

function parseOffset(value: string | null) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function filterOutlets(
  outlets: Outlet[],
  filters: { outletType?: string | null; outletSize?: string | null; query?: string | null },
): Outlet[] {
  const outletType = filters.outletType && filters.outletType !== "All" ? filters.outletType : null;
  const outletSize = filters.outletSize && filters.outletSize !== "All" ? filters.outletSize : null;
  const query = filters.query?.trim().toLowerCase() || "";

  return outlets.filter((outlet) => {
    if (outletType && outlet.outlet_type !== outletType) return false;
    if (outletSize && outlet.outlet_size !== outletSize) return false;

    if (query) {
      const matches =
        outlet.outlet_id.toLowerCase().includes(query) ||
        outlet.outlet_type.toLowerCase().includes(query) ||
        outlet.outlet_size.toLowerCase().includes(query);

      if (!matches) return false;
    }

    return true;
  });
}

function queryTable(table: string, outletId: string | null, limit: number | null) {
  const database = getDb();

  if (outletId) {
    const statement = database.query(`SELECT * FROM "${table}" WHERE "Outlet_ID" = ?`);
    return statement.all(outletId);
  }

  if (limit) {
    const statement = database.query(`SELECT * FROM "${table}" LIMIT ${limit}`);
    return statement.all();
  }

  const statement = database.query(`SELECT * FROM "${table}"`);
  return statement.all();
}

const server = Bun.serve({
  port,
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/budgets") {
      try {
        const outletId = url.searchParams.get("outlet_id");
        const limit = parseLimit(url.searchParams.get("limit"));
        const rows = queryTable("fih_budget_allocations", outletId, limit);
        return jsonResponse({ rows, count: rows.length });
      } catch (error) {
        return jsonResponse({ error: (error as Error).message }, 500);
      }
    }

    if (url.pathname === "/api/predictions") {
      try {
        const outletId = url.searchParams.get("outlet_id");
        const limit = parseLimit(url.searchParams.get("limit"));
        const rows = queryTable("fih_predictions", outletId, limit);
        return jsonResponse({ rows, count: rows.length });
      } catch (error) {
        return jsonResponse({ error: (error as Error).message }, 500);
      }
    }

    if (url.pathname === "/api/outlet-dataset") {
      try {
        const dataset = await loadOutletDataset(getDb());
        return jsonResponse(dataset);
      } catch (error) {
        return jsonResponse({ error: (error as Error).message }, 500);
      }
    }

    if (url.pathname === "/api/outlets") {
      try {
        const dataset = await loadOutletDataset(getDb());
        const limit = parseLimit(url.searchParams.get("limit")) ?? 200;
        const offset = parseOffset(url.searchParams.get("offset"));
        const outletType = url.searchParams.get("outlet_type");
        const outletSize = url.searchParams.get("outlet_size");
        const query = url.searchParams.get("query");

        const filtered = filterOutlets(dataset.outlets, { outletType, outletSize, query });
        const total = filtered.length;
        const rows = filtered.slice(offset, offset + limit);
        const budgetAllocated = filtered.reduce((sum, outlet) => sum + outlet.trade_spend_lkr, 0);
        const totalLiters = filtered.reduce(
          (sum, outlet) => sum + outlet.maximum_monthly_liters,
          0,
        );
        const highTierOutlets = filtered.filter((outlet) => outlet.capacity_tier === "High").length;

        return jsonResponse({
          rows,
          total,
          metrics: {
            total_outlets: total,
            avg_maximum_monthly_liters: total > 0 ? Math.round(totalLiters / total) : 0,
            high_tier_outlets: highTierOutlets,
            budget_allocated_lkr: budgetAllocated,
          },
          outlet_types: dataset.outlet_types,
          outlet_sizes: dataset.outlet_sizes,
        });
      } catch (error) {
        return jsonResponse({ error: (error as Error).message }, 500);
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
});

console.log(`Outlet backend running on http://localhost:${server.port}`);
console.log(`DB path: ${dbPath}`);
