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
	// biome-ignore lint/suspicious/noDocumentCookie: cookie mirrors token for server-side auth checks.
	document.cookie = `access_token=${token}; path=/; samesite=lax; secure`;
}

export function clearAccessToken() {
	if (typeof window === "undefined") {
		return;
	}

	localStorage.removeItem(ACCESS_TOKEN_KEY);
	// biome-ignore lint/suspicious/noDocumentCookie: cookie mirror must be cleared on logout.
	document.cookie = "access_token=; path=/; max-age=0; samesite=lax; secure";
}
