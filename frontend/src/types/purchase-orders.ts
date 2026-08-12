import { z } from "zod";

import type {
	ApiResult,
	PaginatedResponse,
} from "@/types/purchase-requisitions";

export const poStatusValues = [
	"draft",
	"pending_approval",
	"approved",
	"dispatched",
	"partial_received",
	"fully_received",
	"invoiced",
	"closed",
	"cancelled",
] as const;

export type POStatus = (typeof poStatusValues)[number];
export type POSortField = "id" | "poNumber" | "status" | "createdAt";

export interface PurchaseOrder {
	id: number;
	poNumber: string;
	supplierId: number;
	status: POStatus;
	subtotalPaise: number;
	taxAmountPaise: number;
	totalAmountPaise: number;
	paymentTermsDays: number | null;
	deliveryTerms: string | null;
	notes: string | null;
	expectedDeliveryDate: string | null;
	approvedBy: number | null;
	currentApprovalLevel: number;
	totalApprovalLevels: number;
	createdAt: string;
	createdBy: number;
	revisedDeliveryDate: string | null;
	delayReason: string | null;
	supplierConfirmed: boolean;
	confirmationMethod: string | null;
	confirmedAt: string | null;
	confirmedBy: number | null;
	confirmationNote: string | null;
	closedAt: string | null;
	closedBy: number | null;
	closeNote: string | null;
}

export interface PurchaseOrderItem {
	id: number;
	poId: number;
	itemId: number;
	qty: number;
	receivedQty: number;
	unitPricePaise: number;
	uom: string | null;
	itemSku?: string;
	itemName?: string;
	itemCategory?: string;
	prItemId?: number | null;
	prNumber?: string | null;
}

export interface PurchaseOrderDetailPayload {
	po: PurchaseOrder;
	items: PurchaseOrderItem[];
}

export type PurchaseOrderListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: POSortField;
	sortDir?: "asc" | "desc";
	status?: POStatus | POStatus[];
	supplierId?: number;
	q?: string;
	overdue?: boolean;
};

export type POCreatePayload = {
	supplierId: number;
	paymentTermsDays?: number;
	deliveryTerms?: string;
	expectedDeliveryDate?: string;
	notes?: string;
	lines: Array<{
		prItemId: number;
		unitPricePaise: number;
	}>;
};

export type POCreateResult = ApiResult<PurchaseOrderDetailPayload>;
export type POListResult = PaginatedResponse<PurchaseOrder>;

export type POUpdatePayload = {
	poId: number;
	paymentTermsDays?: number | null;
	deliveryTerms?: string | null;
	notes?: string | null;
	expectedDeliveryDate?: string | null;
	inserts?: Array<{ prItemId: number; unitPricePaise: number }>;
	updates?: Array<{ id: number; unitPricePaise: number }>;
	deletes?: Array<{ id: number }>;
};

export type POUpdateResult = ApiResult<{
	po: PurchaseOrder;
	items: PurchaseOrderItem[];
}>;

export type POCancelResult = ApiResult<PurchaseOrder>;

export type LastRateSource = "po_history" | "supplier_catalog" | "pr_estimate";

export type LastRateResult = ApiResult<{
	ratePaise: number;
	source: LastRateSource;
}>;

export const poCommunicationChannelValues = [
	"email",
	"whatsapp",
	"phone",
	"in_person",
] as const;
export type PoCommunicationChannel =
	(typeof poCommunicationChannelValues)[number];
export type PoCommunicationType = "po_sent" | "reminder" | "escalation";
export type PoCommunicationStatus = "logged" | "success" | "failed";

export interface PoCommunication {
	id: number;
	poId: number;
	type: PoCommunicationType;
	channel: PoCommunicationChannel;
	status: PoCommunicationStatus;
	toEmail: string | null;
	note: string | null;
	errorMessage: string | null;
	sentBy: number | null;
	sentAt: string;
}

export type LogPoCommunicationPayload = {
	channel: PoCommunicationChannel;
	note?: string;
	toEmail?: string;
};
export type UpdatePoDelayPayload = {
	revisedDeliveryDate?: string;
	delayReason?: string;
};
export type ConfirmPoPayload = { confirmationMethod: string; note?: string };
export type MarkPoInvoicedPayload = {
	invoiceNumber: string;
	invoiceDate: string;
	billedAmountPaise: number;
	dueDate?: string;
};
export type ClosePoPayload = { note?: string };

// Bare responses — confirmed via backend source, do not wrap in { po: ... }:
export type POSendResult = ApiResult<PurchaseOrder>;
export type PODelayResult = ApiResult<PurchaseOrder>;
export type POConfirmResult = ApiResult<PurchaseOrder>;
export type POInvoiceResult = ApiResult<PurchaseOrder>;
export type POCloseResult = ApiResult<PurchaseOrder>;
export type POCommunicationResult = ApiResult<PoCommunication>;

export const markPoInvoicedSchema = z.object({
	invoiceNumber: z.string().min(1, "Invoice number is required"),
	invoiceDate: z.string().min(1, "Invoice date is required"),
	billedAmountRupees: z.coerce
		.number()
		.nonnegative("Amount cannot be negative"),
	dueDate: z.string().optional(),
});
export type MarkPoInvoicedFormInput = z.infer<typeof markPoInvoicedSchema>;
