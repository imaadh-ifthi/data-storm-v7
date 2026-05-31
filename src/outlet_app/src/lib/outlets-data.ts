export type Tier = "High" | "Medium" | "Low";

export type BudgetBand = "Unfunded" | "Seed" | "Core" | "Priority";

export interface Outlet {
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
}

export interface OutletTypeBreakdown {
  outlet_type: string;
  outlets: number;
  maximum_monthly_liters: number;
  trade_spend_lkr: number;
}

export interface OutletSizeBreakdown {
  outlet_size: string;
  outlets: number;
  maximum_monthly_liters: number;
  trade_spend_lkr: number;
}

export interface OutletDatasetSummary {
  total_outlets: number;
  funded_outlets: number;
  total_budget_lkr: number;
  avg_maximum_monthly_liters: number;
  median_maximum_monthly_liters: number;
  total_projected_liters: number;
}

export interface OutletDataset {
  outlets: Outlet[];
  summary: OutletDatasetSummary;
  outlet_types: string[];
  outlet_sizes: string[];
  type_breakdown: OutletTypeBreakdown[];
  size_breakdown: OutletSizeBreakdown[];
}

export interface OutletPageMetrics {
  total_outlets: number;
  avg_maximum_monthly_liters: number;
  high_tier_outlets: number;
  budget_allocated_lkr: number;
}

export interface OutletPageResponse {
  rows: Outlet[];
  total: number;
  metrics: OutletPageMetrics;
  outlet_types: string[];
  outlet_sizes: string[];
  summary?: OutletDatasetSummary;
  type_breakdown?: OutletTypeBreakdown[];
  size_breakdown?: OutletSizeBreakdown[];
}
