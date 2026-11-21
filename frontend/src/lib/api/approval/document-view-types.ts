import type {
	ApprovalRequestSummary,
	ApprovalTrailEntry,
	PaginationMeta,
} from "@/types/approval";
import type { PurchaseOrderDetailPayload } from "@/types/purchase-orders";
import type { PurchaseRequisitionDetailPayload } from "@/types/purchase-requisitions";
import type { ScoDetailPayload } from "@/types/subcontracting";

/**
 * Inbox row: the existing summary plus the fields getMyPendingApprovals adds (BR-FF-80).
 * The backend sends the flat fields; the nested `docSummary` is gone.
 */
export type ApprovalInboxRow = Omit<ApprovalRequestSummary, "docSummary"> & {
	docNumber: string;
	requesterName: string | null;
	/** Absent when the list belongs to another employee (BR-FF-77, 89). */
	amountPaise?: number | null;
};

export type ApprovalInboxResponse = {
	success: true;
	data: ApprovalInboxRow[];
	meta: PaginationMeta & {
		typeCounts: { pr: number; po: number; sco: number };
	};
};

type ViewExtras = {
	requesterNote: string | null;
	request:
		| (Omit<ApprovalRequestSummary, "docSummary"> & {
				requesterName?: string | null;
		  })
		| null;
	trail: ApprovalTrailEntry[];
	canAct: boolean;
};

export type ApprovalDocumentView = ViewExtras &
	Partial<PurchaseRequisitionDetailPayload> &
	Partial<PurchaseOrderDetailPayload> &
	Partial<ScoDetailPayload>;
