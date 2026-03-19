import { useQuery } from "@tanstack/react-query";
import { fetchMacroHero, fetchMacroHistory } from "../api/macro";

export function useMacroHero(period = 7) {
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
