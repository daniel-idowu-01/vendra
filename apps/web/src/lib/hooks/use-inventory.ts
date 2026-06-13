import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPath } from "../api-client";
import { useAuthStore } from "../auth-store";

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  lowStockLevel: number;
  quantity: number;
};

type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

export function useProducts(page: number = 1, pageSize: number = 50) {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["products", organizationId, page, pageSize],
    queryFn: () =>
      apiFetch<PaginatedProducts>(
        apiPath("/inventory/products", { page, pageSize })
      ),
    enabled: !!organizationId
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      sku?: string;
      barcode?: string;
      unit?: string;
      costPrice?: number;
      sellingPrice?: number;
      lowStockLevel?: number;
      initialQuantity?: number;
    }) => apiFetch<Product>("/inventory/products", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });
}

export type ProductImportResult = {
  created: number;
  updated: number;
  skipped: number;
  totalProcessed: number;
  filename: string | null;
  errors: string[];
};

export function useImportProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<ProductImportResult>("/inventory/products/import", {
        method: "POST",
        body: formData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}

type StockLevel = {
  productId: string;
  total: number;
  byBranch: { branchId: string; quantity: number }[];
};

export function useStockLevel(productId: string) {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["stock-level", organizationId, productId],
    queryFn: () =>
      apiFetch<StockLevel>(apiPath(`/inventory/products/${productId}/stock`)),
    enabled: !!organizationId && !!productId
  });
}

type Branch = {
  id: string;
  name: string;
};

export function useBranches() {
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ["branches", organizationId],
    queryFn: () => apiFetch<Branch[]>(apiPath("/inventory/branches")),
    enabled: !!organizationId
  });
}

export function useRecordTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      productId: string;
      branchId: string;
      type: string;
      quantity: number;
      note?: string;
      idempotencyKey?: string;
    }) =>
      apiFetch("/inventory/transactions", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-level"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}
