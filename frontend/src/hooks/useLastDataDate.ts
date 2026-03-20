import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

interface HealthResponse {
  status: string;
  last_data_date: string | null;
}

export function useLastDataDate() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/health"),
    staleTime: 5 * 60 * 1000, // 5 min
  });
  return data?.last_data_date ?? null;
}
