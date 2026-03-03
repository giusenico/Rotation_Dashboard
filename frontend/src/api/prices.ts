import { apiFetch } from "./client";
import type {
  PriceResponse,
  PerformanceEntry,
  DrawdownResponse,
  CorrelationResponse,
  DashboardSummary,
} from "../types/prices";

export function fetchPrices(symbol: string, startDate?: string, endDate?: string) {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return apiFetch<PriceResponse>(`/api/prices/${symbol}`, params);
}

export function fetchMultiPrices(symbols: string[], startDate?: string, endDate?: string) {
  const params: Record<string, string> = { symbols: symbols.join(",") };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return apiFetch<PriceResponse[]>("/api/prices/multi", params);
}

export function fetchPerformance(symbols = "all") {
  return apiFetch<PerformanceEntry[]>("/api/prices/performance", { symbols });
}

export function fetchDrawdown(symbol: string, startDate?: string, endDate?: string) {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return apiFetch<DrawdownResponse>(`/api/prices/${symbol}/drawdown`, params);
}

export function fetchCorrelation(symbols: string[], lookbackDays = 252) {
  return apiFetch<CorrelationResponse>("/api/prices/correlation", {
    symbols: symbols.join(","),
    lookback_days: lookbackDays,
  });
}

export function fetchDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/prices/dashboard/summary");
}
