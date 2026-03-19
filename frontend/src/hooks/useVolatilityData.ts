import { useQuery } from "@tanstack/react-query";
import {
  fetchVolatilitySummary,
  fetchVolatilityDetail,
} from "../api/volatility";

export function useVolatilitySummary(window = 252) {
  return useQuery({
    queryKey: ["volatility", "summary", window],
    queryFn: () => fetchVolatilitySummary(window),
  });
}

export function useVolatilityDetail(lookback = 500, window = 252) {
  return useQuery({
    queryKey: ["volatility", "detail", lookback, window],
    queryFn: () => fetchVolatilityDetail(lookback, window),
  });
}
