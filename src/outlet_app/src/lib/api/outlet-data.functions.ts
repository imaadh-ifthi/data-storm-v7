import type { OutletPageResponse } from "../outlets-data";

const rawBaseUrl = import.meta.env.VITE_OUTLET_API_BASE_URL ?? "http://localhost:8787";
const baseUrl = rawBaseUrl.replace(/\/+$/, "");

type OutletPageParams = {
  outletType?: string;
  outletSize?: string;
  query?: string;
  limit?: number;
  offset?: number;
};

export async function getOutletPage(params: OutletPageParams): Promise<OutletPageResponse> {
  const searchParams = new URLSearchParams();

  if (params.outletType && params.outletType !== "All") {
    searchParams.set("outlet_type", params.outletType);
  }

  if (params.outletSize && params.outletSize !== "All") {
    searchParams.set("outlet_size", params.outletSize);
  }

  if (params.query && params.query.trim()) {
    searchParams.set("query", params.query.trim());
  }

  if (params.limit) {
    searchParams.set("limit", params.limit.toString());
  }

  if (params.offset) {
    searchParams.set("offset", params.offset.toString());
  }

  const queryString = searchParams.toString();
  const url = queryString ? `${baseUrl}/api/outlets?${queryString}` : `${baseUrl}/api/outlets`;

  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as OutletPageResponse;
}