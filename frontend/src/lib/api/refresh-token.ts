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

async function refreshAccessToken() {
	const response = await fetch(`${apiBaseUrl}${API_ROUTES.auth.refresh}`, {
		method: "POST",
		credentials: "include",
	});

	if (!response.ok) {
		clearAccessToken();
		useAuthSessionStore.getState().clearSession();
		throw new Error("Session expired");
	}

	const json = (await response.json()) as {
		success: boolean;
		data?: { accessToken?: string };
	};

	if (!json.success || !json.data?.accessToken) {
		clearAccessToken();
		useAuthSessionStore.getState().clearSession();
		throw new Error("Session expired");
	}

	setAccessToken(json.data.accessToken);
	useAuthSessionStore.getState().setToken(json.data.accessToken);
	return json.data.accessToken;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAcrossTabs(staleToken: string | null): Promise<string> {
	if (typeof navigator === "undefined" || !navigator.locks) {
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

export function refreshAccessTokenOnce(staleToken: string | null) {
	if (!refreshPromise) {
		refreshPromise = refreshAcrossTabs(staleToken).finally(() => {
			refreshPromise = null;
		});
	}

	return refreshPromise;
}
