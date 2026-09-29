import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type { AuthUser, LoginInput } from "@/types/auth";

export type LoginResponse =
	| {
			success: true;
			message?: string;
			data: {
				accessToken: string;
				user: AuthUser;
			};
	  }
	| {
			success: false;
			message: string;
			data?: null;
	  };

export type MeResponse = {
	success: true;
	data: AuthUser;
};

export function login(input: LoginInput) {
	return api.post<LoginResponse, LoginInput>(API_ROUTES.auth.login, input, {
		skipAuth: true,
	});
}

export function getMe() {
	return api.get<MeResponse>(API_ROUTES.auth.me);
}

export function logout() {
	return api.post<{ success: true }>(API_ROUTES.auth.logout);
}
