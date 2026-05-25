import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiPath } from "../api-client";
import { useAuthStore } from "../auth-store";

type DashboardData = {
  todaySales: number;
  openDebt: number;
  lowStockCount: number;
  insights: string[];
};

export function useDashboard() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["dashboard", organizationId],
    queryFn: () => apiFetch<DashboardData>(apiPath("/analytics/dashboard")),
    enabled: !!organizationId
  });
}

type LowStockItem = {
  id: string;
  name: string;
  lowStockLevel: number;
  quantity: number;
};

type DebtSummary = {
  outstanding: number;
  count: number;
  topDebtors: { customer: string; outstanding: number; dueDate: string | null }[];
};

export function useDebtSummary() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["debt-summary", organizationId],
    queryFn: () => apiFetch<DebtSummary>(apiPath("/debts/summary")),
    enabled: !!organizationId
  });
}

export function useLowStock() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["low-stock", organizationId],
    queryFn: () => apiFetch<LowStockItem[]>(apiPath("/inventory/alerts/low-stock")),
    enabled: !!organizationId
  });
}
