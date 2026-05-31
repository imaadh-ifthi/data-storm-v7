import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BudgetBand,
  Outlet,
  OutletDataset,
  OutletSizeBreakdown,
  OutletTypeBreakdown,
  Tier,
} from "./outlets-data";

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

type BudgetRow = {
  Outlet_ID: string;
  Trade_Spend_Allocation_LKR: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../../../");
const silverDir = resolve(repoRoot, "data/silver");
const goldDir = resolve(repoRoot, "data/gold");

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

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

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

export async function loadOutletDataset(): Promise<OutletDataset> {
  if (!cachedDataset) {
    cachedDataset = (async () => {
      const [masters, coordinates, predictions, budgets] = await Promise.all([
        loadRows<MasterRow>(resolve(silverDir, "outlet_master.csv")),
        loadRows<CoordinateRow>(resolve(silverDir, "outlet_coordinates.csv")),
        loadRows<PredictionRow>(resolve(goldDir, "fih_predictions.csv")),
        loadRows<BudgetRow>(resolve(goldDir, "fih_budget_allocations.csv")),
      ]);

      const masterById = new Map(masters.map((row) => [row.Outlet_ID, row]));
      const coordinateById = new Map(coordinates.map((row) => [row.Outlet_ID, row]));
      const predictionById = new Map(predictions.map((row) => [row.Outlet_ID, row]));
      const budgetById = new Map(budgets.map((row) => [row.Outlet_ID, row]));

      const allIds = new Set<string>([
        ...masterById.keys(),
        ...coordinateById.keys(),
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
