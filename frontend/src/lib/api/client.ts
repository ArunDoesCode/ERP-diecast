import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth/token";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required");
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

async function refreshAccessToken() {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    clearAccessToken();
    throw new Error("Session expired");
  }

  const json = (await response.json()) as {
    success: boolean;
    data: { accessToken: string };
  };

  setAccessToken(json.data.accessToken);
  return json.data.accessToken;
}

// Refresh tokens are one-time-use/rotating on the backend (each call deletes the old
// token row and issues a new one). Without this, N concurrent requests hitting a 401
// at the same time would each fire their own POST /auth/refresh with the same
// still-cookie'd refresh token — only the first wins, the rest 401/403 on the refresh
// itself. Sharing one in-flight promise means concurrent 401s all await the same
// single refresh call instead of racing each other.
//
// That module-level promise only covers ONE tab's JS memory though — two browser tabs
// each expiring around the same moment would still race each other's /auth/refresh
// call against the same shared cookie. `navigator.locks` (Web Locks API, same-origin,
// cross-tab) serializes the callback across tabs; once serialized, we first check
// whether localStorage's access token already changed (i.e. another tab's refresh
// already completed and rotated the cookie while we were waiting for the lock) — if so,
// reuse that instead of spending a second, unnecessary /auth/refresh call.
let refreshPromise: Promise<string> | null = null;

function refreshAccessTokenOnce(staleToken: string | null) {
  if (!refreshPromise) {
    refreshPromise = refreshAcrossTabs(staleToken).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function refreshAcrossTabs(staleToken: string | null): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    // Web Locks API unsupported (very old browser) — same-tab dedup above still applies.
    return refreshAccessToken();
  }

  return navigator.locks.request("erp-diecast-auth-refresh", async () => {
    const current = getAccessToken();
    if (current && current !== staleToken) {
      return current;
    }
    return refreshAccessToken();
  });
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const token = options.skipAuth ? null : getAccessToken();

  const runRequest = async (authToken?: string | null) => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : null,
    });

    return response;
  };

  let response = await runRequest(token);

  if (response.status === 401 && !options.skipAuth) {
    const freshToken = await refreshAccessTokenOnce(token);
    response = await runRequest(freshToken);
  }

  if (!response.ok) {
    const fallback = `Request failed with ${response.status}`;
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiClientError(errorBody?.message ?? fallback, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
  patch: <T, B = unknown>(path: string, body?: B, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
