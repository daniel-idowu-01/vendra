import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api-client";
import { useAuthStore } from "../auth-store";

export type Invoice = {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  totalAmount: number;
  status: string;
  customer: { name: string } | null;
  items: { name: string; quantity: number; unitPrice: number; totalAmount: number }[];
  createdAt: string;
};

export function useInvoices() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["invoices", organizationId],
    queryFn: () => apiFetch<Invoice[]>("/invoices"),
    enabled: !!organizationId
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      customerId?: string;
      items: { productId?: string; name: string; quantity: number; unitPrice: number }[];
    }) => apiFetch("/invoices", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    }
  });
}
