import { apiFetch } from "./client";
import type { RRGResponse, RankingEntry } from "../types/rrg";

interface RRGParams {
  trail_length?: number;
  rs_span?: number;
  momentum_span?: number;
  timeframe?: string;
}

export function fetchSectorRRG(params?: RRGParams) {
  return apiFetch<RRGResponse>("/api/rrg/sectors", params as Record<string, number>);
}

export function fetchCrossAssetRRG(params?: RRGParams) {
  return apiFetch<RRGResponse>("/api/rrg/cross-asset", params as Record<string, number>);
}

export function fetchSectorRankings(params?: { timeframe?: string }) {
  return apiFetch<RankingEntry[]>("/api/rrg/rankings/sectors", params as Record<string, string>);
}

export function fetchCrossAssetRankings(params?: { timeframe?: string }) {
  return apiFetch<RankingEntry[]>("/api/rrg/rankings/cross-asset", params as Record<string, string>);
}
