import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api-client";
import { useAuthStore } from "../auth-store";

type AnalyticsData = {
  todaySales: number;
  openDebt: number;
  lowStockCount: number;
  insights: string[];
};

export function useAnalytics() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["analytics", organizationId],
    queryFn: () => apiFetch<AnalyticsData>("/analytics/dashboard"),
    enabled: !!organizationId
  });
}
