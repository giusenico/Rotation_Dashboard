import { apiFetch } from "./client";
import type { RegimeDetailResponse, RegimeSummaryEntry } from "../types/regime";

export type RegimeTimeframe = "daily" | "4h" | "weekly";
export type OverextMode = "Z" | "pct" | "ATR";

export function fetchRegimeSummary(timeframe: RegimeTimeframe = "daily", overextMode: OverextMode = "Z") {
  return apiFetch<RegimeSummaryEntry[]>(`/api/regime/summary?timeframe=${timeframe}&overext_mode=${overextMode}`);
}

export function fetchRegimeDetail(
  symbol: string,
  lookback = 252,
  timeframe: RegimeTimeframe = "daily",
  overextMode: OverextMode = "Z",
) {
  return apiFetch<RegimeDetailResponse>(
    `/api/regime/detail/${symbol}?lookback=${lookback}&timeframe=${timeframe}&overext_mode=${overextMode}`,
  );
}
