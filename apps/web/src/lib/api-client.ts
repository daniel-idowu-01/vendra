import { useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken, organizationId } = useAuthStore.getState();
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}
