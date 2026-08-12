import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type { LoginInput } from "@/types/auth";

export type LoginResponse =
	| {
			success: true;
			message?: string;
			data: {
				accessToken: string;
				user: {
					id: string;
					email: string;
					role: string;
					allowedPages: string[];
				};
			};
	  }
	| {
			success: false;
			message: string;
			data?: null;
	  };

export type MeResponse = {
	success: true;
	data: {
		userId: string;
		userName: string;
		role: string;
		allowedPages: string[];
	};
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
