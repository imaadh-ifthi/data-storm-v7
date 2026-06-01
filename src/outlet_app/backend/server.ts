import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadOutletDataset,
  type Outlet,
  type OutletDatasetSummary,
  type OutletSizeBreakdown,
  type OutletTypeBreakdown,
} from "./outlet-dataset";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");
const dbPath =
  process.env.OUTLET_DB_PATH ?? resolve(repoRoot, "src/outlet_app/db/outlet_data.sqlite");
const port = Number(process.env.PORT ?? 8787);
const llmBaseUrl = process.env.LLM_BASE_URL ?? "";
const llmApiKey = process.env.LLM_API_KEY ?? "";
const llmModel = process.env.LLM_MODEL ?? "gpt-4o-mini";

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

async function readJsonBody(request: Request) {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveChatCompletionsUrl(baseUrl: string) {
  if (!baseUrl) return "";
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

async function narrateExplanation(
  explanation: Record<string, unknown>,
  question: string | null,
) {
  if (!llmBaseUrl || !llmApiKey) {
    return { error: "LLM configuration missing. Set LLM_BASE_URL and LLM_API_KEY." };
  }

  const url = resolveChatCompletionsUrl(llmBaseUrl);
  const prompt = [
    "You are an XAI assistant for a retail outlet forecasting model.",
    "Use ONLY the provided explanation data. Do not invent facts.",
    "Explain in simple business terms: why the outlet got its score,", 
    "which factors increased or decreased it, and how local conditions and constraints affected it.",
    "Respond in 4-6 short bullet points."
  ].join(" ");

  const messages = [
    { role: "system", content: prompt },
    {
      role: "user",
      content: JSON.stringify({ question: question ?? "Explain this outlet score.", explanation }),
    },
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${llmApiKey}`,
    },
    body: JSON.stringify({ model: llmModel, messages, temperature: 0.2 }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { error: `LLM request failed: ${detail || response.status}` };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return { error: "LLM response missing content." };
  }

  return { narrative: content };
}

function parseLimit(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 5000);
}

function parseBoolean(value: string | null) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

function parseOffset(value: string | null) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

type SortKey = "trade_spend_lkr" | "spend_per_1000_liters" | "maximum_monthly_liters";

function parseSortKey(value: string | null): SortKey | null {
  if (value === "trade_spend_lkr") return "trade_spend_lkr";
  if (value === "spend_per_1000_liters") return "spend_per_1000_liters";
  if (value === "maximum_monthly_liters") return "maximum_monthly_liters";
  return null;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

function buildSummary(outlets: Outlet[]): OutletDatasetSummary {
  const totalOutlets = outlets.length;
  const fundedOutlets = outlets.filter((outlet) => outlet.trade_spend_lkr > 0).length;
  const totalBudgetLkr = outlets.reduce((sum, outlet) => sum + outlet.trade_spend_lkr, 0);
  const totalProjectedLiters = outlets.reduce(
    (sum, outlet) => sum + outlet.maximum_monthly_liters,
    0,
  );
  const avgMaximumMonthlyLiters =
    totalOutlets > 0 ? Math.round(totalProjectedLiters / totalOutlets) : 0;
  const medianMaximumMonthlyLiters = median(
    outlets.map((outlet) => outlet.maximum_monthly_liters),
  );

  return {
    total_outlets: totalOutlets,
    funded_outlets: fundedOutlets,
    total_budget_lkr: totalBudgetLkr,
    avg_maximum_monthly_liters: avgMaximumMonthlyLiters,
    median_maximum_monthly_liters: medianMaximumMonthlyLiters,
    total_projected_liters: totalProjectedLiters,
  };
}

function buildTypeBreakdown(outlets: Outlet[]): OutletTypeBreakdown[] {
  const typeMap = new Map<string, OutletTypeBreakdown>();

  outlets.forEach((outlet) => {
    const row = typeMap.get(outlet.outlet_type) ?? {
      outlet_type: outlet.outlet_type,
      outlets: 0,
      maximum_monthly_liters: 0,
      trade_spend_lkr: 0,
    };

    row.outlets += 1;
    row.maximum_monthly_liters += outlet.maximum_monthly_liters;
    row.trade_spend_lkr += outlet.trade_spend_lkr;
    typeMap.set(outlet.outlet_type, row);
  });

  return Array.from(typeMap.values()).sort((a, b) =>
    a.outlet_type.localeCompare(b.outlet_type),
  );
}

function buildSizeBreakdown(outlets: Outlet[]): OutletSizeBreakdown[] {
  const sizeMap = new Map<string, OutletSizeBreakdown>();

  outlets.forEach((outlet) => {
    const row = sizeMap.get(outlet.outlet_size) ?? {
      outlet_size: outlet.outlet_size,
      outlets: 0,
      maximum_monthly_liters: 0,
      trade_spend_lkr: 0,
    };

    row.outlets += 1;
    row.maximum_monthly_liters += outlet.maximum_monthly_liters;
    row.trade_spend_lkr += outlet.trade_spend_lkr;
    sizeMap.set(outlet.outlet_size, row);
  });

  return Array.from(sizeMap.values()).sort((a, b) =>
    a.outlet_size.localeCompare(b.outlet_size),
  );
}

function filterOutlets(
  outlets: Outlet[],
  filters: {
    outletType?: string | null;
    outletSize?: string | null;
    query?: string | null;
    fundedOnly?: boolean;
  },
): Outlet[] {
  const outletType = filters.outletType && filters.outletType !== "All" ? filters.outletType : null;
  const outletSize = filters.outletSize && filters.outletSize !== "All" ? filters.outletSize : null;
  const query = filters.query?.trim().toLowerCase() || "";
  const fundedOnly = filters.fundedOnly ?? false;

  return outlets.filter((outlet) => {
    if (outletType && outlet.outlet_type !== outletType) return false;
    if (outletSize && outlet.outlet_size !== outletSize) return false;

    if (fundedOnly && outlet.trade_spend_lkr <= 0) return false;

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

function sortOutlets(outlets: Outlet[], sortKey: SortKey | null, sortDir: "asc" | "desc") {
  if (!sortKey) return outlets;
  const multiplier = sortDir === "asc" ? 1 : -1;
  return [...outlets].sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    return (left - right) * multiplier;
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
  async fetch(request: Request) {
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

    if (url.pathname === "/api/outlet-explanations") {
      try {
        const outletId = url.searchParams.get("outlet_id");
        if (!outletId) {
          return jsonResponse({ error: "Missing outlet_id query parameter." }, 400);
        }
        const dataset = await loadOutletDataset(getDb());
        const outlet = dataset.outlets.find((row) => row.outlet_id === outletId);
        if (!outlet || !outlet.xai_explanation) {
          return jsonResponse({ error: "Explanation not found for outlet." }, 404);
        }
        return jsonResponse({ outlet_id: outletId, explanation: outlet.xai_explanation });
      } catch (error) {
        return jsonResponse({ error: (error as Error).message }, 500);
      }
    }

    if (url.pathname === "/api/outlet-explanations/narrate") {
      try {
        if (request.method !== "POST") {
          return jsonResponse({ error: "Method not allowed" }, 405);
        }

        const body = await readJsonBody(request);
        const outletId = typeof body?.outlet_id === "string" ? body.outlet_id : null;
        const question = typeof body?.question === "string" ? body.question : null;

        if (!outletId) {
          return jsonResponse({ error: "Missing outlet_id in request body." }, 400);
        }

        const dataset = await loadOutletDataset(getDb());
        const outlet = dataset.outlets.find((row) => row.outlet_id === outletId);
        if (!outlet || !outlet.xai_explanation) {
          return jsonResponse({ error: "Explanation not found for outlet." }, 404);
        }

        const result = await narrateExplanation(outlet.xai_explanation as Record<string, unknown>, question);
        if ("error" in result) {
          return jsonResponse(result, 502);
        }

        return jsonResponse({ outlet_id: outletId, narrative: result.narrative });
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
        const fundedOnly = parseBoolean(url.searchParams.get("funded_only"));
        const sortKey = parseSortKey(url.searchParams.get("sort_key"));
        const sortDir = url.searchParams.get("sort_dir") === "asc" ? "asc" : "desc";

        const filtered = filterOutlets(dataset.outlets, {
          outletType,
          outletSize,
          query,
          fundedOnly,
        });
        const sorted = sortOutlets(filtered, sortKey, sortDir);
        const total = sorted.length;
        const rows = sorted.slice(offset, offset + limit);
        const budgetAllocated = filtered.reduce((sum, outlet) => sum + outlet.trade_spend_lkr, 0);
        const totalLiters = filtered.reduce(
          (sum, outlet) => sum + outlet.maximum_monthly_liters,
          0,
        );
        const highTierOutlets = filtered.filter((outlet) => outlet.capacity_tier === "High").length;
        const summary = buildSummary(filtered);
        const typeBreakdown = buildTypeBreakdown(filtered);
        const sizeBreakdown = buildSizeBreakdown(filtered);
        const outletTypes = Array.from(new Set(filtered.map((outlet) => outlet.outlet_type))).sort(
          (a, b) => a.localeCompare(b),
        );
        const outletSizes = Array.from(new Set(filtered.map((outlet) => outlet.outlet_size))).sort(
          (a, b) => a.localeCompare(b),
        );

        return jsonResponse({
          rows,
          total,
          metrics: {
            total_outlets: total,
            avg_maximum_monthly_liters: total > 0 ? Math.round(totalLiters / total) : 0,
            high_tier_outlets: highTierOutlets,
            budget_allocated_lkr: budgetAllocated,
          },
          outlet_types: outletTypes,
          outlet_sizes: outletSizes,
          summary,
          type_breakdown: typeBreakdown,
          size_breakdown: sizeBreakdown,
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
