// `useAuthSessionStore`'s `role` field is a plain decoded-JWT string (no
// exported `Role` union type exists in `@/lib/store/auth-session-store`), so
// these helpers accept `string | null | undefined` directly.

const DRAFT_CRUD_ROLES = [
	"super-admin",
	"owner",
	"back_office",
	"floor_supervisor",
];
const QA_DECISION_ROLES = [
	"super-admin",
	"owner",
	"back_office",
	"qa_inspector",
];
const BYPASS_ROLES = [
	"super-admin",
	"owner",
	"back_office",
	"floor_supervisor",
];
const CORRECTION_ROLES = ["super-admin", "owner", "back_office"];
const OVER_RECEIPT_EXEMPT_ROLES = ["owner", "back_office"]; // NOT super-admin

export function canManageGrnDraft(role?: string | null) {
	return !!role && DRAFT_CRUD_ROLES.includes(role);
}

export function canDecideGrnQa(role?: string | null) {
	return !!role && QA_DECISION_ROLES.includes(role);
}

export function canBypassGrnQa(role?: string | null) {
	return !!role && BYPASS_ROLES.includes(role);
}

export function canCorrectGrnLine(role?: string | null) {
	return !!role && CORRECTION_ROLES.includes(role);
}

export function isExemptFromOverReceiptGuard(role?: string | null) {
	return !!role && OVER_RECEIPT_EXEMPT_ROLES.includes(role);
}
