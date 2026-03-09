import { useQuery } from "@tanstack/react-query";
import { fetchRegimeDetail, fetchRegimeSummary } from "../api/regime";
import type { RegimeTimeframe, OverextMode } from "../api/regime";

export function useRegimeSummary(timeframe: RegimeTimeframe = "daily", overextMode: OverextMode = "Z") {
  return useQuery({
    queryKey: ["regime", "summary", timeframe, overextMode],
    queryFn: () => fetchRegimeSummary(timeframe, overextMode),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useRegimeDetail(
  symbol: string | null,
  lookback = 252,
  timeframe: RegimeTimeframe = "daily",
  overextMode: OverextMode = "Z",
) {
  return useQuery({
    queryKey: ["regime", "detail", symbol, lookback, timeframe, overextMode],
    queryFn: () => fetchRegimeDetail(symbol!, lookback, timeframe, overextMode),
    enabled: symbol !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
