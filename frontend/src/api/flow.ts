import { apiFetch } from "./client";
import type { OBVDetailResponse, OBVScoreHistoryEntry, OBVStructureEntry } from "../types/flow";

export type OBVTimeframe = "daily" | "4h" | "weekly";

export function fetchOBVStructure(timeframe: OBVTimeframe = "daily") {
  return apiFetch<OBVStructureEntry[]>(`/api/obv/structure?timeframe=${timeframe}`);
}

export function fetchOBVScoreHistory(symbols?: string[], lookback = 252) {
  const params = new URLSearchParams({ lookback: String(lookback) });
  if (symbols && symbols.length > 0) params.set("symbols", symbols.join(","));
  return apiFetch<OBVScoreHistoryEntry[]>(`/api/obv/score-history?${params}`);
}

export function fetchOBVDetail(symbol: string, lookback = 252, timeframe: OBVTimeframe = "daily") {
  return apiFetch<OBVDetailResponse>(`/api/obv/detail/${symbol}?lookback=${lookback}&timeframe=${timeframe}`);
}
