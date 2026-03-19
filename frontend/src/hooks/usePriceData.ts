import { useQuery } from "@tanstack/react-query";
import {
  fetchPerformance,
  fetchDrawdown,
  fetchMultiPrices,
  fetchCorrelation,
  fetchDashboardSummary,
} from "../api/prices";
import { fetchTickers } from "../api/tickers";
import type { TickerInfo } from "../types/prices";

type TickerCategoryMap = Record<string, string[]>;

type TickerGroups = {
  sectors: string[];
  crossAsset: string[];
  all: string[];
  byCategory: TickerCategoryMap;
};

const TICKERS_CACHE = {
  staleTime: 60 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
};

export function usePerformance(symbols = "all") {
  return useQuery({
    queryKey: ["performance", symbols],
    queryFn: () => fetchPerformance(symbols),
  });
}

export function useDrawdown(symbol: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["drawdown", symbol, startDate, endDate],
    queryFn: () => fetchDrawdown(symbol, startDate, endDate),
    enabled: !!symbol,
  });
}

export function useMultiPrices(symbols: string[], startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["prices", "multi", symbols, startDate, endDate],
    queryFn: () => fetchMultiPrices(symbols, startDate, endDate),
    enabled: symbols.length > 0,
  });
}

export function useCorrelation(symbols: string[], lookbackDays = 252) {
  return useQuery({
    queryKey: ["correlation", symbols, lookbackDays],
    queryFn: () => fetchCorrelation(symbols, lookbackDays),
    enabled: symbols.length >= 2,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: fetchDashboardSummary,
  });
}

/** Raw ticker list (shared cache with useTickers). */
export function useTickersRaw() {
  return useQuery({
    queryKey: ["tickers"],
    queryFn: () => fetchTickers(),
    ...TICKERS_CACHE,
  });
}

export function useTickers() {
  return useQuery({
    queryKey: ["tickers"],
    queryFn: () => fetchTickers(),
    ...TICKERS_CACHE,
    select: (data: TickerInfo[]) => {
      const byCategory: TickerCategoryMap = {};
      const sectors = data.filter((t) => t.category === "Sector ETF").map((t) => t.symbol);
      const crossAsset = data
        .filter((t) => t.category !== "Sector ETF" && t.category !== "Benchmark")
        .map((t) => t.symbol);
      for (const ticker of data) {
        byCategory[ticker.category] = [...(byCategory[ticker.category] ?? []), ticker.symbol];
      }
      for (const key of Object.keys(byCategory)) {
        byCategory[key] = [...new Set(byCategory[key])].sort();
      }
      const all = [...sectors, ...crossAsset];
      return {
        sectors,
        crossAsset,
        all,
        byCategory,
      } as TickerGroups;
    },
  });
}
