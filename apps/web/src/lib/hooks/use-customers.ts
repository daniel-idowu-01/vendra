import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api-client";
import { useAuthStore } from "../auth-store";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

export function useCustomers() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["customers", organizationId],
    queryFn: () => apiFetch<Customer[]>("/customers"),
    enabled: !!organizationId
  });
}
