import { useAuthSessionStore } from "@/lib/store/auth-session-store";

/** True when the signed-in user holds the permission key (super-admin gets every key from /auth/me). */
export function useCan(key: string) {
	return useAuthSessionStore((state) => state.permissions.includes(key));
}
