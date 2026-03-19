import { useQuery } from "@tanstack/react-query";
import { fetchOBVDetail, fetchOBVScoreHistory, fetchOBVStructure } from "../api/flow";
import type { OBVTimeframe } from "../api/flow";

export function useOBVStructure(timeframe: OBVTimeframe = "daily") {
  return useQuery({
    queryKey: ["obv", "structure", timeframe],
    queryFn: () => fetchOBVStructure(timeframe),
  });
}

export function useOBVScoreHistory(symbols?: string[], lookback = 252) {
  return useQuery({
    queryKey: ["obv", "score-history", symbols ?? "all", lookback],
    queryFn: () => fetchOBVScoreHistory(symbols, lookback),
  });
}

export function useOBVDetail(symbol: string | null, lookback = 252, timeframe: OBVTimeframe = "daily") {
  return useQuery({
    queryKey: ["obv", "detail", symbol, lookback, timeframe],
    queryFn: () => fetchOBVDetail(symbol!, lookback, timeframe),
    enabled: symbol !== null,
  });
}
