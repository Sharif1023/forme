let csrfToken = "";

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "REQUEST_FAILED",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof Blob))
    headers.set("Content-Type", "application/json");
  if (csrfToken && init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()))
    headers.set("x-csrf-token", csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(25000),
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("We couldn't reach the store. Please try again.", 0, "NETWORK_ERROR");
  }
  const result = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string; code?: string; details?: unknown };
  } | null;
  if (response.status === 401 && path.startsWith("/admin/") && !path.startsWith("/admin/auth/"))
    window.dispatchEvent(new Event("admin-session-expired"));
  if (!response.ok)
    throw new ApiError(
      result?.error?.message ?? "The request could not be completed.",
      response.status,
      result?.error?.code,
      result?.error?.details,
    );
  if (!result || !("data" in result))
    throw new ApiError("The store returned an unexpected response.", response.status);
  return result.data as T;
}

export const money = (minor: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(minor / 100);
