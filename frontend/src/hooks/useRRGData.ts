import { useQuery } from "@tanstack/react-query";
import { fetchSectorRRG, fetchCrossAssetRRG, fetchSectorRankings, fetchCrossAssetRankings } from "../api/rrg";

interface RRGParams {
  trail_length?: number;
  rs_span?: number;
  momentum_span?: number;
  timeframe?: string;
}

export function useSectorRRG(params?: RRGParams, enabled: boolean = true) {
  return useQuery({
    queryKey: ["rrg", "sectors", params],
    queryFn: () => fetchSectorRRG(params),
    enabled,
  });
}

export function useCrossAssetRRG(params?: RRGParams, enabled: boolean = true) {
  return useQuery({
    queryKey: ["rrg", "cross-asset", params],
    queryFn: () => fetchCrossAssetRRG(params),
    enabled,
  });
}

export function useSectorRankings(timeframe: string = "weekly", enabled: boolean = true) {
  return useQuery({
    queryKey: ["rrg", "rankings", "sectors", timeframe],
    queryFn: () => fetchSectorRankings({ timeframe }),
    enabled,
  });
}

export function useCrossAssetRankings(timeframe: string = "weekly", enabled: boolean = true) {
  return useQuery({
    queryKey: ["rrg", "rankings", "cross-asset", timeframe],
    queryFn: () => fetchCrossAssetRankings({ timeframe }),
    enabled,
  });
}
