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
    const freshToken = await refreshAccessToken();
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
