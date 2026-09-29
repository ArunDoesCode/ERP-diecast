import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import type { AuthScreen } from "@/types/auth";

type AuthProfile = {
	userId?: string;
	userName?: string;
	role?: string;
	permissions?: string[];
	screens?: AuthScreen[];
};

type AuthSessionState = {
	token: string | null;
	userId: string | null;
	userName: string | null;
	/** Display only — never gate UI on this; use `permissions` (useCan). */
	role: string | null;
	permissions: string[];
	screens: AuthScreen[];
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
	permissions: [] as string[],
	screens: [] as AuthScreen[],
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

					set({ token }, false, "auth-session/setToken");
				},

				setProfile: (profile) => {
					set(
						(state) => ({
							userId: profile.userId ?? state.userId,
							userName: profile.userName ?? state.userName,
							role: profile.role ?? state.role,
							permissions: profile.permissions ?? state.permissions,
							screens: profile.screens ?? state.screens,
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
					permissions: state.permissions,
					screens: state.screens,
				}),
				onRehydrateStorage: () => (state) => {
					state?.setHasHydrated(true);
				},
			},
		),
		{ name: "auth-session-store" },
	),
);
