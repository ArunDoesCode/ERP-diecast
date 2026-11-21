import type { ApprovalDocType } from "@/types/approval";

export const DOC_TYPE_LABEL: Record<ApprovalDocType, string> = {
	pr: "Requisition",
	po: "Order",
	sco: "Job work",
};

/** Role key to a label: "back_office" -> "Back office" (never the raw key, BR-FF-81). */
export function roleLabel(role: string | null | undefined): string {
	if (!role) return "";
	const text = role.replace(/[_-]+/g, " ").trim().toLowerCase();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Full page of the document (read-only for approvers without the doc key). */
export function documentPageHref(docType: ApprovalDocType, docId: number) {
	if (docType === "pr") return `/purchase-requisitions/${docId}`;
	if (docType === "po") return `/purchase-orders/${docId}`;
	return `/subcontracting/${docId}`;
}
