import { ApiClientError } from "@/lib/api/client";

/** Plain-language text for PR / approval error codes (BR-PR-06/08/15/17/19/21). */
export const PR_ERROR_MESSAGES: Record<string, string> = {
	PR_NOT_EDITABLE: "Only a draft PR can be edited. Withdraw it first.",
	PR_NOT_REQUESTER: "Only the person who raised this PR can change it.",
	PR_MIN_ONE_LINE: "A PR needs at least one item line.",
	PR_INVALID_ITEM: "One of the items is missing or inactive. Pick another.",
	PR_DUPLICATE_ITEM: "The same item is on the PR twice. Keep one line.",
	PR_DATE_IN_PAST: "Required-by date cannot be in the past.",
	APPROVAL_ALREADY_OPEN: "This PR is already waiting for approval.",
	APPROVAL_NOT_REQUESTER: "Only the person who raised this PR can withdraw it.",
};

export function prErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	if (error.code && PR_ERROR_MESSAGES[error.code]) {
		return PR_ERROR_MESSAGES[error.code];
	}
	return error.message;
}
