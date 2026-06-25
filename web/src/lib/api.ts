const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "myntra-clone-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, userName?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (userName) localStorage.setItem("myntra-clone-user", userName);
  window.dispatchEvent(new Event("auth-changed"));
}

export function getUserName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("myntra-clone-user");
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("myntra-clone-user");
  window.dispatchEvent(new Event("auth-changed"));
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }

  // Notify the UI (e.g. header bag badge) when the cart changed, so counts
  // stay in sync without a page navigation. Fires for any successful cart
  // mutation, including checkout (which empties the bag).
  if (typeof window !== "undefined" && method !== "GET" && path.startsWith("/cart")) {
    window.dispatchEvent(new Event("cart-changed"));
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return undefined as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export { BASE_URL };
