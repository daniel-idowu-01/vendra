import { useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { message?: string; details?: unknown }
  ) {
    super(readApiErrorMessage(body, status));
    this.name = "ApiError";
  }
}

function readApiErrorMessage(body: { message?: string; details?: unknown }, status: number) {
  if (body.message) return body.message;
  if (typeof body.details === "string") return body.details;
  if (
    body.details &&
    typeof body.details === "object" &&
    "message" in body.details
  ) {
    const details = body.details as { message?: string | string[] };
    if (Array.isArray(details.message)) return details.message.join(", ");
    if (details.message) return details.message;
  }
  return `Request failed with ${status}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: { message?: string; details?: unknown } = {};
    try {
      body = await response.json();
    } catch {
      body = { message: `Request failed with ${response.status}` };
    }
    throw new ApiError(response.status, body);
  }
  return response.json() as Promise<T>;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken, organizationId } = useAuthStore.getState();
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (organizationId) headers["x-organization-id"] = organizationId;

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }
  });

  return handleResponse<T>(response);
}

export function apiPath(path: string, params?: Record<string, string | number | undefined>): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
