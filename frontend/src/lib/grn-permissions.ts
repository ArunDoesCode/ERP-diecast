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
// floor_supervisor removed (BR-GRN-19)
const BYPASS_ROLES = ["super-admin", "owner", "back_office"];
const CORRECTION_ROLES = ["super-admin", "owner", "back_office"];
// super-admin passes the over-receipt check too (BR-AUTH-21)
const OVER_RECEIPT_OVERRIDE_ROLES = ["super-admin", "owner", "back_office"];

// perm: grn.edit_draft
export function canManageGrnDraft(role?: string | null) {
	return !!role && DRAFT_CRUD_ROLES.includes(role);
}

// perm: grn.qa_decide
export function canDecideGrnQa(role?: string | null) {
	return !!role && QA_DECISION_ROLES.includes(role);
}

// perm: grn.qa_bypass
export function canBypassGrnQa(role?: string | null) {
	return !!role && BYPASS_ROLES.includes(role);
}

// perm: grn.correct
export function canCorrectGrnLine(role?: string | null) {
	return !!role && CORRECTION_ROLES.includes(role);
}

// perm: grn.over_receipt_override
export function canOverrideOverReceipt(role?: string | null) {
	return !!role && OVER_RECEIPT_OVERRIDE_ROLES.includes(role);
}
