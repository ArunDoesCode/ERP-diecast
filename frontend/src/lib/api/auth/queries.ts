"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import { clearAccessToken, setAccessToken } from "@/lib/auth/token";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type { LoginInput } from "@/types/auth";

import { getMe, login, logout } from "./fetchers";

export const authKeys = {
	me: () => ["auth", "me"] as const,
};

export function useMeQuery(enabled: boolean) {
	const query = useQuery({
		queryKey: authKeys.me(),
		queryFn: getMe,
		enabled,
	});

	useEffect(() => {
		if (!query.data) return;

		const result = query.data;

		useAuthSessionStore.getState().setProfile({
			userId: result.data.userId,
			userName: result.data.userName,
			role: result.data.role,
			allowedPages: result.data.allowedPages,
		});
	}, [query.data]);

	return query;
}

export function useLoginMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: LoginInput) => login(payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Login failed");
				return;
			}

			setAccessToken(result.data.accessToken);
			useAuthSessionStore.getState().setToken(result.data.accessToken);
			useAuthSessionStore.getState().setProfile({
				userId: result.data.user.id,
				userName: result.data.user.email,
				role: result.data.user.role,
				allowedPages: result.data.user.allowedPages,
			});
			await queryClient.invalidateQueries({ queryKey: authKeys.me() });
			toast.success(result.message || "Login successful");
		},
		onError: (error) => {
			toast.error(
				error instanceof ApiClientError ? error.message : "Login failed",
			);
		},
	});
}

export function useLogoutMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: logout,
		onSettled: async () => {
			clearAccessToken();
			useAuthSessionStore.getState().clearSession();
			queryClient.clear();
		},
	});
}
