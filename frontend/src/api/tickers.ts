import { apiFetch } from "./client";
import type { TickerInfo } from "../types/prices";

export function fetchTickers(category?: string) {
  const params: Record<string, string> = {};
  if (category) params.category = category;
  return apiFetch<TickerInfo[]>("/api/tickers", params);
}
