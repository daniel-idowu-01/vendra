import { useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const LOGIN_PATH = "/login";

type SessionResponse = {
  accessToken: string;
  refreshToken?: string;
  organizationId?: string;
};

let refreshPromise: Promise<boolean> | null = null;

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
  return fetchWithAuth<T>(path, init, true);
}

async function fetchWithAuth<T>(path: string, init: RequestInit, allowRefresh: boolean): Promise<T> {
  const { accessToken, organizationId } = useAuthStore.getState();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers["content-type"] = "application/json";
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (organizationId) headers["x-organization-id"] = organizationId;

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }
  });

  if (response.status === 401 && allowRefresh && path !== "/auth/refresh") {
    const refreshed = await refreshSession();
    if (refreshed) {
      return fetchWithAuth<T>(path, init, false);
    }
    redirectToLogin();
  }

  return handleResponse<T>(response);
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = doRefreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefreshSession() {
  try {
    // The refresh token lives in an httpOnly cookie; `credentials: "include"`
    // sends it. Nothing is read from JS-accessible storage.
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" }
    });

    if (!response.ok) return false;

    const session = (await response.json()) as SessionResponse;
    useAuthStore.getState().updateAccessToken(session);
    return true;
  } catch {
    return false;
  }
}

function redirectToLogin() {
  useAuthStore.getState().clear();
  if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) {
    window.location.assign(LOGIN_PATH);
  }
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
