import { useQuery } from "@tanstack/react-query";
import { fetchSectorRRG, fetchCrossAssetRRG, fetchSectorRankings, fetchCrossAssetRankings } from "../api/rrg";

interface RRGParams {
  trail_length?: number;
  rs_span?: number;
  momentum_span?: number;
  timeframe?: string;
}

export function useSectorRRG(params?: RRGParams) {
  return useQuery({
    queryKey: ["rrg", "sectors", params],
    queryFn: () => fetchSectorRRG(params),
  });
}

export function useCrossAssetRRG(params?: RRGParams) {
  return useQuery({
    queryKey: ["rrg", "cross-asset", params],
    queryFn: () => fetchCrossAssetRRG(params),
  });
}

export function useSectorRankings(timeframe: string = "weekly") {
  return useQuery({
    queryKey: ["rrg", "rankings", "sectors", timeframe],
    queryFn: () => fetchSectorRankings({ timeframe }),
  });
}

export function useCrossAssetRankings(timeframe: string = "weekly") {
  return useQuery({
    queryKey: ["rrg", "rankings", "cross-asset", timeframe],
    queryFn: () => fetchCrossAssetRankings({ timeframe }),
  });
}
