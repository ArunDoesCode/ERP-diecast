import {
	clearAccessToken,
	getAccessToken,
	setAccessToken,
} from "@/lib/auth/token";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";

import { API_ROUTES } from "./routes";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl) {
	throw new Error("NEXT_PUBLIC_API_URL is required");
}

/** Refresh failed: drop the session and send the user to sign in again (BR-AUTH session states). */
function endSession() {
	clearAccessToken();
	useAuthSessionStore.getState().clearSession();
	if (
		typeof window !== "undefined" &&
		!window.location.pathname.startsWith("/login")
	) {
		window.location.replace("/login");
	}
}

async function refreshAccessToken() {
	const response = await fetch(`${apiBaseUrl}${API_ROUTES.auth.refresh}`, {
		method: "POST",
		credentials: "include",
	});

	if (!response.ok) {
		endSession();
		throw new Error("Session expired");
	}

	const json = (await response.json()) as {
		success: boolean;
		data?: { accessToken?: string };
	};

	if (!json.success || !json.data?.accessToken) {
		endSession();
		throw new Error("Session expired");
	}

	setAccessToken(json.data.accessToken);
	return json.data.accessToken;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAcrossTabs(staleToken: string | null): Promise<string> {
	if (typeof navigator === "undefined" || !navigator.locks) {
		return refreshAccessToken();
	}

	// Tabs share the refresh cookie, and each refresh rotates it (single use): one tab at a time.
	return navigator.locks.request("erp-diecast-auth-refresh", async () => {
		// The token is per tab (memory, BR-AUTH-30): reuse it only if this tab already refreshed.
		const current = getAccessToken();
		if (current && current !== staleToken) {
			return current;
		}

		return refreshAccessToken();
	});
}

export function refreshAccessTokenOnce(staleToken: string | null) {
	if (!refreshPromise) {
		refreshPromise = refreshAcrossTabs(staleToken).finally(() => {
			refreshPromise = null;
		});
	}

	return refreshPromise;
}
