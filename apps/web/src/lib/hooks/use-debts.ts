import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api-client";

export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { debtRecordId: string; amount: number; note?: string }) =>
      apiFetch("/debts/payments", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      queryClient.invalidateQueries({ queryKey: ["debt-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}

export function useSendReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { debtRecordId: string; customerId: string }) =>
      apiFetch("/debts/remind", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
}
