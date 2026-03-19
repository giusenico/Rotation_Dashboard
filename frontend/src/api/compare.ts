import { apiFetch } from "./client";
import type { CompareResponse } from "../types/compare";

export function fetchComparison(symbols: string[], lookback = 252) {
  return apiFetch<CompareResponse>(
    `/api/compare?symbols=${symbols.join(",")}&lookback=${lookback}`
  );
}
