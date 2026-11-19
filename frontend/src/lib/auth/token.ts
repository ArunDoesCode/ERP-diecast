// BR-AUTH-30: the access token lives only in this module's memory. Never in localStorage,
// sessionStorage, a persisted store or a cookie scripts can read. A reload loses it on purpose:
// the httpOnly refresh cookie gets a new one (see refresh-token.ts).
let accessToken: string | null = null;

export function getAccessToken() {
	return accessToken;
}

export function setAccessToken(token: string) {
	accessToken = token;
}

export function clearAccessToken() {
	accessToken = null;
}

// One-time clean-up of what older builds left behind (localStorage token, persisted store,
// JS-readable cookie), so no copy of a token outlives this release in the browser.
if (typeof window !== "undefined") {
	try {
		window.localStorage.removeItem("access_token");
		window.localStorage.removeItem("auth-session-store");
	} catch {
		// storage blocked: nothing was stored either
	}
	if (document.cookie.includes("access_token=")) {
		// biome-ignore lint/suspicious/noDocumentCookie: expiring the legacy token cookie.
		document.cookie = "access_token=; path=/; max-age=0; samesite=lax";
	}
}
