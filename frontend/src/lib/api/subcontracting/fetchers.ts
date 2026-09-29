import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ChallanCreatePayload,
	ChallanCreateResult,
	ChallanDetailResult,
	ChallanListResult,
	CompanySettings,
	CompanySettingsPayload,
	CompanySettingsResult,
	OpenChallanParams,
	OpenChallanResult,
	QaDecisionPayload,
	ReceiptCreatePayload,
	ReceiptDetailResult,
	ReceiptListResult,
	ScoCancelPayload,
	ScoCreatePayload,
	ScoDetailPayload,
	ScoDetailResult,
	ScoListParams,
	ScoListResult,
	ScoUpdatePayload,
} from "@/types/subcontracting";
import type { ApiResult } from "@/types/suppliers";

function toQueryString(params?: Record<string, unknown>) {
	if (!params) return "";

	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);

	if (entries.length === 0) return "";

	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getScos(params?: ScoListParams) {
	return api.get<ScoListResult>(
		`${API_ROUTES.subcontracting.list}${toQueryString(params)}`,
	);
}

export function getScoById(scoId: number) {
	return api.get<ScoDetailResult>(API_ROUTES.subcontracting.detail(scoId));
}

export function createSco(payload: ScoCreatePayload) {
	return api.post<ApiResult<ScoDetailPayload>, ScoCreatePayload>(
		API_ROUTES.subcontracting.create,
		payload,
	);
}

export function updateSco(payload: ScoUpdatePayload) {
	return api.patch<ApiResult<ScoDetailPayload>, ScoUpdatePayload>(
		API_ROUTES.subcontracting.update,
		payload,
	);
}

export function submitSco(scoId: number) {
	return api.post<ApiResult<ScoDetailPayload>>(
		API_ROUTES.subcontracting.submit(scoId),
	);
}

export function cancelSco(scoId: number, payload: ScoCancelPayload) {
	return api.post<ApiResult<ScoDetailPayload>, ScoCancelPayload>(
		API_ROUTES.subcontracting.cancel(scoId),
		payload,
	);
}

export function getCompanySettings() {
	return api.get<CompanySettingsResult>(API_ROUTES.company.settings);
}

export function saveCompanySettings(payload: CompanySettingsPayload) {
	return api.patch<ApiResult<CompanySettings>, CompanySettingsPayload>(
		API_ROUTES.company.settings,
		payload,
	);
}

export function issueChallan(scoId: number, payload: ChallanCreatePayload) {
	return api.post<ChallanCreateResult, ChallanCreatePayload>(
		API_ROUTES.subcontracting.challans(scoId),
		payload,
	);
}

export function getScoChallans(scoId: number) {
	return api.get<ChallanListResult>(API_ROUTES.subcontracting.challans(scoId));
}

export function getOpenChallans(params?: OpenChallanParams) {
	return api.get<OpenChallanResult>(
		`${API_ROUTES.subcontracting.openChallans}${toQueryString(params)}`,
	);
}

export function getChallanById(challanId: number) {
	return api.get<ChallanDetailResult>(
		API_ROUTES.subcontracting.challanDetail(challanId),
	);
}

export function createReceipt(scoId: number, payload: ReceiptCreatePayload) {
	return api.post<ReceiptDetailResult, ReceiptCreatePayload>(
		API_ROUTES.subcontracting.receipts(scoId),
		payload,
	);
}

export function getScoReceipts(scoId: number) {
	return api.get<ReceiptListResult>(API_ROUTES.subcontracting.receipts(scoId));
}

export function getReceiptById(receiptId: number) {
	return api.get<ReceiptDetailResult>(
		API_ROUTES.subcontracting.receiptDetail(receiptId),
	);
}

export function decideReceiptQa(
	receiptId: number,
	lineId: number,
	payload: QaDecisionPayload,
) {
	return api.post<ReceiptDetailResult, QaDecisionPayload>(
		API_ROUTES.subcontracting.receiptQa(receiptId, lineId),
		payload,
	);
}
