import { useQuery } from "@tanstack/react-query";
import { fetchOBVDetail, fetchOBVScoreHistory, fetchOBVStructure } from "../api/flow";
import type { OBVTimeframe } from "../api/flow";

export function useOBVStructure(timeframe: OBVTimeframe = "daily") {
  return useQuery({
    queryKey: ["obv", "structure", timeframe],
    queryFn: () => fetchOBVStructure(timeframe),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOBVScoreHistory(symbols?: string[], lookback = 252) {
  return useQuery({
    queryKey: ["obv", "score-history", symbols ?? "all", lookback],
    queryFn: () => fetchOBVScoreHistory(symbols, lookback),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOBVDetail(symbol: string | null, lookback = 252, timeframe: OBVTimeframe = "daily") {
  return useQuery({
    queryKey: ["obv", "detail", symbol, lookback, timeframe],
    queryFn: () => fetchOBVDetail(symbol!, lookback, timeframe),
    enabled: symbol !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
