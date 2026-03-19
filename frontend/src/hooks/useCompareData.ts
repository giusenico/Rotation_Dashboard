import { useQuery } from "@tanstack/react-query";
import { fetchComparison } from "../api/compare";

export function useComparison(symbols: string[], lookback = 252) {
  return useQuery({
    queryKey: ["compare", symbols.join(","), lookback],
    queryFn: () => fetchComparison(symbols, lookback),
    enabled: symbols.length >= 2,
  });
}
