import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { AuthScreen } from "@/types/auth";

type AuthProfile = {
	userId?: string;
	userName?: string;
	role?: string;
	isSuperAdmin?: boolean;
	permissions?: string[];
	screens?: AuthScreen[];
};

/**
 * The signed-in user's profile, in memory only (BR-AUTH-30): nothing is persisted, and the
 * access token is not kept here (see `@/lib/auth/token`). On load the profile comes from
 * `/auth/me` after the session is restored through the refresh cookie.
 */
type AuthSessionState = {
	userId: string | null;
	userName: string | null;
	/** Display only — never gate UI on this; use `permissions` (useCan). */
	role: string | null;
	/** For BR-PR-17 ownership checks only; other gates use useCan. */
	isSuperAdmin: boolean;
	permissions: string[];
	screens: AuthScreen[];
	/** true once the session is restored (profile loaded) or known to be gone. */
	hasHydrated: boolean;
	setProfile: (profile: AuthProfile) => void;
	clearSession: () => void;
};

const initialState = {
	userId: null,
	userName: null,
	role: null,
	isSuperAdmin: false,
	permissions: [] as string[],
	screens: [] as AuthScreen[],
};

export const useAuthSessionStore = create<AuthSessionState>()(
	devtools(
		(set) => ({
			...initialState,
			hasHydrated: false,

			setProfile: (profile) => {
				set(
					(state) => ({
						userId: profile.userId ?? state.userId,
						userName: profile.userName ?? state.userName,
						role: profile.role ?? state.role,
						isSuperAdmin: profile.isSuperAdmin ?? state.isSuperAdmin,
						permissions: profile.permissions ?? state.permissions,
						screens: profile.screens ?? state.screens,
						hasHydrated: true,
					}),
					false,
					"auth-session/setProfile",
				);
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
		{ name: "auth-session-store" },
	),
);
