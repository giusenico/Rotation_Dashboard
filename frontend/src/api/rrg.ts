import { apiFetch } from "./client";
import type { RRGResponse, RankingEntry } from "../types/rrg";

interface RRGParams {
  trail_length?: number;
  rs_span?: number;
  momentum_span?: number;
}

export function fetchSectorRRG(params?: RRGParams) {
  return apiFetch<RRGResponse>("/api/rrg/sectors", params as Record<string, number>);
}

export function fetchCrossAssetRRG(params?: RRGParams) {
  return apiFetch<RRGResponse>("/api/rrg/cross-asset", params as Record<string, number>);
}

export function fetchSectorRankings() {
  return apiFetch<RankingEntry[]>("/api/rrg/rankings/sectors");
}

export function fetchCrossAssetRankings() {
  return apiFetch<RankingEntry[]>("/api/rrg/rankings/cross-asset");
}
