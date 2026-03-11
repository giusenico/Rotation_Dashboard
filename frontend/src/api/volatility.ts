import { apiFetch } from "./client";
import type {
  VolatilitySummary,
  VolatilityDetailResponse,
} from "../types/volatility";

export function fetchVolatilitySummary(window = 252) {
  return apiFetch<VolatilitySummary>(`/api/volatility/summary?window=${window}`);
}

export function fetchVolatilityDetail(lookback = 500, window = 252) {
  return apiFetch<VolatilityDetailResponse>(
    `/api/volatility/detail?lookback=${lookback}&window=${window}`,
  );
}
