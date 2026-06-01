import type { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Tier = "High" | "Medium" | "Low";
export type BudgetBand = "Unfunded" | "Seed" | "Core" | "Priority";

export type ExplanationDriver = {
  feature: string;
  value: string | number | null;
  contribution: number;
};

export type ExplanationSignal = {
  feature: string;
  value: string | number | null;
};

export type OperationalConstraints = {
  cooler_count: number | null;
  historical_max_volume: number | null;
};

export type OutletExplanation = {
  predicted_raw: number;
  maximum_monthly_liters: number;
  base_value: number;
  top_positive_drivers: ExplanationDriver[];
  top_negative_drivers: ExplanationDriver[];
  local_environment_signals: ExplanationSignal[];
  operational_constraints: OperationalConstraints;
};

export type Outlet = {
  outlet_id: string;
  outlet_type: string;
  outlet_size: string;
  cooler_count: number;
  latitude: number | null;
  longitude: number | null;
  maximum_monthly_liters: number;
  trade_spend_lkr: number;
  capacity_tier: Tier;
  budget_band: BudgetBand;
  spend_per_1000_liters: number;
  allocation_share_pct: number;
  summary_note: string;
  xai_explanation: OutletExplanation | null;
};

export type OutletTypeBreakdown = {
  outlet_type: string;
  outlets: number;
  maximum_monthly_liters: number;
  trade_spend_lkr: number;
};

export type OutletSizeBreakdown = {
  outlet_size: string;
  outlets: number;
  maximum_monthly_liters: number;
  trade_spend_lkr: number;
};

export type OutletDatasetSummary = {
  total_outlets: number;
  funded_outlets: number;
  total_budget_lkr: number;
  avg_maximum_monthly_liters: number;
  median_maximum_monthly_liters: number;
  total_projected_liters: number;
};

export type OutletDataset = {
  outlets: Outlet[];
  summary: OutletDatasetSummary;
  outlet_types: string[];
  outlet_sizes: string[];
  type_breakdown: OutletTypeBreakdown[];
  size_breakdown: OutletSizeBreakdown[];
};

type CsvRow = Record<string, string>;

type MasterRow = {
  Outlet_ID: string;
  Outlet_Size: string;
  Cooler_Count: string;
  Outlet_Type: string;
};

type CoordinateRow = {
  Outlet_ID: string;
  Latitude: string;
  Longitude: string;
};

type PredictionRow = {
  Outlet_ID: string;
  Maximum_Monthly_Liters: string;
};

type ExplanationRow = {
  Outlet_ID: string;
  Predicted_Raw: string;
  Maximum_Monthly_Liters: string;
  Base_Value: string;
  Top_Positive_Drivers: string;
  Top_Negative_Drivers: string;
  Local_Environment_Signals: string;
  Operational_Constraints: string;
};

type BudgetRow = {
  Outlet_ID: string;
  Trade_Spend_Allocation_LKR: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");
const silverDir = resolve(repoRoot, "data/silver");

let cachedDataset: Promise<OutletDataset> | undefined;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xfeff) {
    headerLine = headerLine.slice(1);
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    return row;
  });
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseNumber(value: string | undefined) {
  if (value == null || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNullableNumber(value: string | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1));
  return sorted[index];
}

function capacityTier(value: number, mediumThreshold: number, highThreshold: number): Tier {
  if (value >= highThreshold) return "High";
  if (value >= mediumThreshold) return "Medium";
  return "Low";
}

function budgetBand(spend: number): BudgetBand {
  if (spend <= 0) return "Unfunded";
  if (spend <= 1000) return "Seed";
  if (spend <= 5000) return "Core";
  return "Priority";
}

function formatNumber(value: number) {
  return value.toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

function formatCurrency(value: number) {
  return `LKR ${formatNumber(value)}`;
}

async function loadRows<T extends CsvRow>(filePath: string): Promise<T[]> {
  const text = await readFile(filePath, "utf8");
  return parseCsv(text) as T[];
}

function loadTableRows<T>(db: Database, table: string): T[] {
  const statement = db.query(`SELECT * FROM "${table}"`);
  return statement.all() as T[];
}

export async function loadOutletDataset(db: Database): Promise<OutletDataset> {
  if (!cachedDataset) {
    cachedDataset = (async () => {
      const [masters, coordinates] = await Promise.all([
        loadRows<MasterRow>(resolve(silverDir, "outlet_master.csv")),
        loadRows<CoordinateRow>(resolve(silverDir, "outlet_coordinates.csv")),
      ]);

      const predictions = loadTableRows<PredictionRow>(db, "fih_predictions");
      const explanations = loadTableRows<ExplanationRow>(db, "fih_explanations");
      const budgets = loadTableRows<BudgetRow>(db, "fih_budget_allocations");

      const masterById = new Map(masters.map((row) => [row.Outlet_ID, row]));
      const coordinateById = new Map(coordinates.map((row) => [row.Outlet_ID, row]));
      const predictionById = new Map(predictions.map((row) => [row.Outlet_ID, row]));
      const explanationById = new Map(explanations.map((row) => [row.Outlet_ID, row]));
      const budgetById = new Map(budgets.map((row) => [row.Outlet_ID, row]));

      const allIds = new Set<string>([
        ...masterById.keys(),
        ...coordinateById.keys(),
        ...explanationById.keys(),
        ...predictionById.keys(),
        ...budgetById.keys(),
      ]);

      const totalBudgetLkr = budgets.reduce(
        (sum, row) => sum + parseNumber(row.Trade_Spend_Allocation_LKR),
        0,
      );

      const outletsBase = Array.from(allIds).map((outletId) => {
        const master = masterById.get(outletId);
        const coordinatesRow = coordinateById.get(outletId);
        const prediction = predictionById.get(outletId);
        const explanation = explanationById.get(outletId);
        const budget = budgetById.get(outletId);

        const maximumMonthlyLiters = parseNumber(prediction?.Maximum_Monthly_Liters);
        const tradeSpendLkr = parseNumber(budget?.Trade_Spend_Allocation_LKR);
        const latitude = parseNullableNumber(coordinatesRow?.Latitude);
        const longitude = parseNullableNumber(coordinatesRow?.Longitude);
        const coolerCount = parseNumber(master?.Cooler_Count);
        const outletType = master?.Outlet_Type ? titleCase(master.Outlet_Type) : "Unknown";
        const outletSize = master?.Outlet_Size ? titleCase(master.Outlet_Size) : "Unknown";
        const allocationSharePct =
          totalBudgetLkr > 0 ? +((tradeSpendLkr / totalBudgetLkr) * 100).toFixed(2) : 0;
        const spendPer1000Liters =
          tradeSpendLkr > 0 && maximumMonthlyLiters > 0
            ? +(tradeSpendLkr / (maximumMonthlyLiters / 1000)).toFixed(2)
            : 0;

        const xaiExplanation = explanation
          ? {
              predicted_raw: parseNumber(explanation.Predicted_Raw),
              maximum_monthly_liters: parseNumber(explanation.Maximum_Monthly_Liters),
              base_value: parseNumber(explanation.Base_Value),
              top_positive_drivers: parseJson<ExplanationDriver[]>(
                explanation.Top_Positive_Drivers,
                [],
              ),
              top_negative_drivers: parseJson<ExplanationDriver[]>(
                explanation.Top_Negative_Drivers,
                [],
              ),
              local_environment_signals: parseJson<ExplanationSignal[]>(
                explanation.Local_Environment_Signals,
                [],
              ),
              operational_constraints: parseJson<OperationalConstraints>(
                explanation.Operational_Constraints,
                { cooler_count: null, historical_max_volume: null },
              ),
            }
          : null;

        return {
          outlet_id: outletId,
          outlet_type: outletType,
          outlet_size: outletSize,
          cooler_count: coolerCount,
          latitude,
          longitude,
          maximum_monthly_liters: maximumMonthlyLiters,
          trade_spend_lkr: tradeSpendLkr,
          capacity_tier: "Low" as Tier,
          budget_band: budgetBand(tradeSpendLkr),
          spend_per_1000_liters: spendPer1000Liters,
          allocation_share_pct: allocationSharePct,
          summary_note:
            tradeSpendLkr > 0
              ? `${formatCurrency(tradeSpendLkr)} is allocated to support roughly ${formatNumber(maximumMonthlyLiters)}L of monthly capacity.`
              : `No allocation appears in the gold budget file; capacity is still estimated at ${formatNumber(maximumMonthlyLiters)}L per month.`,
          xai_explanation: xaiExplanation,
        } satisfies Outlet;
      });

      const capacityValues = outletsBase.map((outlet) => outlet.maximum_monthly_liters);
      const mediumThreshold = quantile(capacityValues, 0.45);
      const highThreshold = quantile(capacityValues, 0.75);

      const outlets = outletsBase
        .map((outlet) => ({
          ...outlet,
          capacity_tier: capacityTier(
            outlet.maximum_monthly_liters,
            mediumThreshold,
            highThreshold,
          ),
        }))
        .sort((a, b) => a.outlet_id.localeCompare(b.outlet_id));

      const totalProjectedLiters = outlets.reduce(
        (sum, outlet) => sum + outlet.maximum_monthly_liters,
        0,
      );
      const fundedOutlets = outlets.filter((outlet) => outlet.trade_spend_lkr > 0).length;
      const averageCapacity =
        outlets.length > 0 ? Math.round(totalProjectedLiters / outlets.length) : 0;
      const medianCapacity = median(capacityValues);

      const typeMap = new Map<string, OutletTypeBreakdown>();
      const sizeMap = new Map<string, OutletSizeBreakdown>();

      outlets.forEach((outlet) => {
        const typeRow = typeMap.get(outlet.outlet_type) ?? {
          outlet_type: outlet.outlet_type,
          outlets: 0,
          maximum_monthly_liters: 0,
          trade_spend_lkr: 0,
        };
        typeRow.outlets += 1;
        typeRow.maximum_monthly_liters += outlet.maximum_monthly_liters;
        typeRow.trade_spend_lkr += outlet.trade_spend_lkr;
        typeMap.set(outlet.outlet_type, typeRow);

        const sizeRow = sizeMap.get(outlet.outlet_size) ?? {
          outlet_size: outlet.outlet_size,
          outlets: 0,
          maximum_monthly_liters: 0,
          trade_spend_lkr: 0,
        };
        sizeRow.outlets += 1;
        sizeRow.maximum_monthly_liters += outlet.maximum_monthly_liters;
        sizeRow.trade_spend_lkr += outlet.trade_spend_lkr;
        sizeMap.set(outlet.outlet_size, sizeRow);
      });

      return {
        outlets,
        summary: {
          total_outlets: outlets.length,
          funded_outlets: fundedOutlets,
          total_budget_lkr: totalBudgetLkr,
          avg_maximum_monthly_liters: averageCapacity,
          median_maximum_monthly_liters: medianCapacity,
          total_projected_liters: totalProjectedLiters,
        },
        outlet_types: Array.from(new Set(outlets.map((outlet) => outlet.outlet_type))).sort(
          (a, b) => a.localeCompare(b),
        ),
        outlet_sizes: Array.from(new Set(outlets.map((outlet) => outlet.outlet_size))).sort(
          (a, b) => a.localeCompare(b),
        ),
        type_breakdown: Array.from(typeMap.values()).sort((a, b) =>
          a.outlet_type.localeCompare(b.outlet_type),
        ),
        size_breakdown: Array.from(sizeMap.values()).sort((a, b) =>
          a.outlet_size.localeCompare(b.outlet_size),
        ),
      };
    })();
  }

  return cachedDataset;
}
