import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../api-client";

export type Organization = {
  organization: { id: string; name: string; slug: string };
  role: string;
};

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => apiFetch<Organization[]>("/organizations")
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiFetch<{ accessToken: string; organizationId?: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data)
      })
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (data: {
      email: string;
      name: string;
      password: string;
      organizationName: string;
      phone?: string;
    }) =>
      apiFetch<{ accessToken: string; organizationId?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(data)
      })
  });
}
