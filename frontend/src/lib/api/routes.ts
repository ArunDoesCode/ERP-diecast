export const API_ROUTES = {
	auth: {
		login: "/auth/login",
		refresh: "/auth/refresh",
		logout: "/auth/logout",
		me: "/auth/me",
		register: "/auth/register",
	},
	files: {
		presign: "/files/presign",
	},
} as const;
