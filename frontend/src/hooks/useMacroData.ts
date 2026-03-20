import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMacroHero, fetchMacroHistory } from "../api/macro";

const ALL_PERIODS = [7, 14, 21, 63];

export function useMacroHero(period = 7) {
  const queryClient = useQueryClient();

  // Prefetch all other periods on mount so switching is instant
  useEffect(() => {
    for (const p of ALL_PERIODS) {
      if (p !== period) {
        queryClient.prefetchQuery({
          queryKey: ["macro", "hero", p],
          queryFn: () => fetchMacroHero(p),
        });
      }
    }
  }, []); // only on mount

  return useQuery({
    queryKey: ["macro", "hero", period],
    queryFn: () => fetchMacroHero(period),
  });
}

export function useMacroHistory(lookback = 300) {
  return useQuery({
    queryKey: ["macro", "history", lookback],
    queryFn: () => fetchMacroHistory(lookback),
  });
}
