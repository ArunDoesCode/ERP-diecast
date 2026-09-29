import { z } from "zod";

export const loginSchema = z.object({
	email: z.email("Enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type AuthScreen = {
	key: string;
	path: string;
	label: string;
	menuGroup: string;
	sortOrder: number;
};

export type AuthUser = {
	id: number;
	name: string;
	email: string | null;
	role: string;
	isSuperAdmin: boolean;
	permissions: string[];
	screens: AuthScreen[];
};
