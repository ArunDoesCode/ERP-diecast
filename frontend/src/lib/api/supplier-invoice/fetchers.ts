import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	DataResponse,
	InvoiceTolerances,
	InvoiceTolerancesPayload,
	PagedResponse,
	SinvBillable,
	SinvCancelPayload,
	SinvCreatePayload,
	SinvDeleted,
	SinvDetail,
	SinvListMeta,
	SinvListParams,
	SinvListRow,
	SinvReleasePayload,
	SinvUpdatePayload,
} from "@/types/supplier-invoice";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getSupplierInvoices(params?: SinvListParams) {
	return api.get<PagedResponse<SinvListRow, SinvListMeta>>(
		`${API_ROUTES.supplierInvoices.list}${toQueryString(params)}`,
	);
}

export function getBillableLines(poId: number, grnId?: number) {
	return api.get<DataResponse<SinvBillable>>(
		`${API_ROUTES.supplierInvoices.billableLines}${toQueryString({ poId, grnId })}`,
	);
}

export function getSupplierInvoice(id: number) {
	return api.get<DataResponse<SinvDetail>>(
		API_ROUTES.supplierInvoices.detail(id),
	);
}

export function createSupplierInvoice(payload: SinvCreatePayload) {
	return api.post<DataResponse<SinvDetail>, SinvCreatePayload>(
		API_ROUTES.supplierInvoices.create,
		payload,
	);
}

export function updateSupplierInvoice(payload: SinvUpdatePayload) {
	return api.patch<DataResponse<SinvDetail>, SinvUpdatePayload>(
		API_ROUTES.supplierInvoices.update,
		payload,
	);
}

export function deleteSupplierInvoice(id: number) {
	return api.delete<DataResponse<SinvDeleted>>(
		API_ROUTES.supplierInvoices.remove(id),
	);
}

export function submitSupplierInvoice(id: number) {
	return api.post<DataResponse<SinvDetail>, Record<string, never>>(
		API_ROUTES.supplierInvoices.submit(id),
		{},
	);
}

export function backToDraftSupplierInvoice(id: number) {
	return api.post<DataResponse<SinvDetail>, Record<string, never>>(
		API_ROUTES.supplierInvoices.backToDraft(id),
		{},
	);
}

export function releaseSupplierInvoice(
	id: number,
	payload: SinvReleasePayload,
) {
	return api.post<DataResponse<SinvDetail>, SinvReleasePayload>(
		API_ROUTES.supplierInvoices.release(id),
		payload,
	);
}

export function cancelSupplierInvoice(id: number, payload: SinvCancelPayload) {
	return api.post<DataResponse<SinvDetail>, SinvCancelPayload>(
		API_ROUTES.supplierInvoices.cancel(id),
		payload,
	);
}

export function getInvoiceTolerances() {
	return api.get<DataResponse<InvoiceTolerances>>(
		API_ROUTES.company.invoiceTolerances,
	);
}

export function saveInvoiceTolerances(payload: InvoiceTolerancesPayload) {
	return api.patch<DataResponse<InvoiceTolerances>, InvoiceTolerancesPayload>(
		API_ROUTES.company.invoiceTolerances,
		payload,
	);
}
