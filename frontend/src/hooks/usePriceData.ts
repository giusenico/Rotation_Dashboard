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

export function usePerformance(symbols = "all") {
  return useQuery({
    queryKey: ["performance", symbols],
    queryFn: () => fetchPerformance(symbols),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDrawdown(symbol: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["drawdown", symbol, startDate, endDate],
    queryFn: () => fetchDrawdown(symbol, startDate, endDate),
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMultiPrices(symbols: string[], startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["prices", "multi", symbols, startDate, endDate],
    queryFn: () => fetchMultiPrices(symbols, startDate, endDate),
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCorrelation(symbols: string[], lookbackDays = 252) {
  return useQuery({
    queryKey: ["correlation", symbols, lookbackDays],
    queryFn: () => fetchCorrelation(symbols, lookbackDays),
    enabled: symbols.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: fetchDashboardSummary,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTickers() {
  return useQuery({
    queryKey: ["tickers"],
    queryFn: () => fetchTickers(),
    staleTime: 30 * 60 * 1000,
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
