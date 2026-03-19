import { apiFetch } from "./client";
import type { MacroHeroResponse, MacroHistoryResponse } from "../types/macro";

export function fetchMacroHero(period = 7) {
  return apiFetch<MacroHeroResponse>(`/api/macro/hero?period=${period}`);
}

export function fetchMacroHistory(lookback = 300) {
  return apiFetch<MacroHistoryResponse>(`/api/macro/history?lookback=${lookback}`);
}
