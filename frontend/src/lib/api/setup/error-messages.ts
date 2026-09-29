import { ApiClientError } from "@/lib/api/client";

// Plain-language text for backend error codes (contract S6). Falls back to the
// server message, then to the caller's default.
const CODE_MESSAGES: Record<string, string> = {
	KEY_NOT_GRANTABLE:
		"This permission cannot be given to a role (it is reserved for super-admin).",
	UNKNOWN_KEY: "That permission no longer exists. Reload and try again.",
	SYSTEM_ROLE_PROTECTED:
		"This is a system role and cannot be changed this way.",
	ROLE_HAS_EMPLOYEES:
		"This role still has active employees. Move them to another role first.",
	ROLE_HAS_INACTIVE_EMPLOYEES:
		"This role still has inactive employees. Move them to another role first.",
	ROLE_IN_APPROVAL_CHAIN:
		"This role is used in an approval chain. Remove it from the chain first.",
	LAST_ADMIN: "This would leave the system with no active super-admin.",
	ROLE_NOT_ASSIGNABLE:
		"You cannot assign this role: it holds permissions you do not have.",
	SCREEN_HAS_NO_KEY:
		"This screen has no permission key, so it cannot be ticked.",
	CONFLICT: "That name is already in use.",
};

export function setupErrorMessage(error: unknown, fallback: string) {
	if (error instanceof ApiClientError) {
		if (error.code && CODE_MESSAGES[error.code]) {
			return CODE_MESSAGES[error.code];
		}
		return error.message;
	}
	return fallback;
}
