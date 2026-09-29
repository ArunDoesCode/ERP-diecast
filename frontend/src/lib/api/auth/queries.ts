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
			userId: String(result.data.id),
			userName: result.data.name,
			role: result.data.role,
			permissions: result.data.permissions,
			screens: result.data.screens,
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
				userId: String(result.data.user.id),
				userName: result.data.user.name,
				role: result.data.user.role,
				permissions: result.data.user.permissions,
				screens: result.data.user.screens,
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
