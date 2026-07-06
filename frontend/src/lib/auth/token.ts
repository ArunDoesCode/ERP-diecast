const ACCESS_TOKEN_KEY = "access_token";

export function getAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  document.cookie = `access_token=${token}; path=/; samesite=lax; secure`;
}

export function clearAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  document.cookie = "access_token=; path=/; max-age=0; samesite=lax; secure";
}

export type AccessTokenPayload = {
  userId: string;
  role: string;
  allowedPages: string[];
  exp: number;
};

export function decodeAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) {
      return null;
    }

    const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded);
    return JSON.parse(decoded) as AccessTokenPayload;
  } catch {
    return null;
  }
}
