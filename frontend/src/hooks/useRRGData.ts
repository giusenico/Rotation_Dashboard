import { useQuery } from "@tanstack/react-query";
import { fetchSectorRRG, fetchCrossAssetRRG, fetchSectorRankings, fetchCrossAssetRankings } from "../api/rrg";

interface RRGParams {
  trail_length?: number;
  rs_span?: number;
  momentum_span?: number;
}

export function useSectorRRG(params?: RRGParams) {
  return useQuery({
    queryKey: ["rrg", "sectors", params],
    queryFn: () => fetchSectorRRG(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCrossAssetRRG(params?: RRGParams) {
  return useQuery({
    queryKey: ["rrg", "cross-asset", params],
    queryFn: () => fetchCrossAssetRRG(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useSectorRankings() {
  return useQuery({
    queryKey: ["rrg", "rankings", "sectors"],
    queryFn: fetchSectorRankings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCrossAssetRankings() {
  return useQuery({
    queryKey: ["rrg", "rankings", "cross-asset"],
    queryFn: fetchCrossAssetRankings,
    staleTime: 5 * 60 * 1000,
  });
}
