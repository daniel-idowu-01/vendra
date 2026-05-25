import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api-client";
import { useAuthStore } from "../auth-store";

export type DebtRecord = {
  id: string;
  originalAmount: number;
  outstanding: number;
  status: string;
  dueDate: string | null;
  customer: { id: string; name: string; phone?: string };
  payments: { id: string; amount: number; paidAt: string }[];
};

export function useDebts() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["debts", organizationId],
    queryFn: () => apiFetch<DebtRecord[]>("/debts"),
    enabled: !!organizationId
  });
}
