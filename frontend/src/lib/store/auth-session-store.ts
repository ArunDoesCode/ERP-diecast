import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import { decodeAccessToken } from "@/lib/auth/token";

type AuthProfile = {
	userId?: string;
	userName?: string;
	role?: string;
	allowedPages?: string[];
};

type AuthSessionState = {
	token: string | null;
	userId: string | null;
	userName: string | null;
	role: string | null;
	allowedPages: string[];
	hasHydrated: boolean;
	setToken: (token: string | null) => void;
	setProfile: (profile: AuthProfile) => void;
	setHasHydrated: (value: boolean) => void;
	clearSession: () => void;
};

const initialState = {
	token: null,
	userId: null,
	userName: null,
	role: null,
	allowedPages: [] as string[],
};

export const useAuthSessionStore = create<AuthSessionState>()(
	devtools(
		persist(
			(set) => ({
				...initialState,
				hasHydrated: false,

				setToken: (token) => {
					if (!token) {
						set(
							{
								...initialState,
							},
							false,
							"auth-session/setToken:clear",
						);
						return;
					}

					const decoded = decodeAccessToken(token);
					set(
						(state) => ({
							token,
							role: decoded?.role ?? state.role,
							allowedPages: decoded?.allowedPages ?? state.allowedPages,
						}),
						false,
						"auth-session/setToken",
					);
				},

				setProfile: (profile) => {
					set(
						(state) => ({
							userId: profile.userId ?? state.userId,
							userName: profile.userName ?? state.userName,
							role: profile.role ?? state.role,
							allowedPages: profile.allowedPages ?? state.allowedPages,
						}),
						false,
						"auth-session/setProfile",
					);
				},

				setHasHydrated: (value) => {
					set({ hasHydrated: value }, false, "auth-session/setHasHydrated");
				},

				clearSession: () => {
					set(
						{
							...initialState,
							hasHydrated: true,
						},
						false,
						"auth-session/clearSession",
					);
				},
			}),
			{
				name: "auth-session-store",
				storage: createJSONStorage(() => localStorage),
				partialize: (state) => ({
					token: state.token,
					userId: state.userId,
					userName: state.userName,
					role: state.role,
					allowedPages: state.allowedPages,
				}),
				onRehydrateStorage: () => (state) => {
					state?.setHasHydrated(true);
				},
			},
		),
		{ name: "auth-session-store" },
	),
);
