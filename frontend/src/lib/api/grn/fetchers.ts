import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	GrnBypassPayload,
	GrnCorrectionPayload,
	GrnCorrectionResult,
	GrnCreatePayload,
	GrnCreateResult,
	GrnDeleteResult,
	GrnDetailResult,
	GrnLineActionResult,
	GrnQaDecisionPayload,
	GrnUpdatePayload,
	GrnUpdateResult,
} from "@/types/grn";

import type { GrnListQuery, GrnListResultV2 } from "./list-types";
import type { ReceivableParams, ReceivableResult } from "./receivable-types";

function toQueryString(params?: Record<string, unknown>) {
	if (!params) return "";

	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);

	if (entries.length === 0) return "";

	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getGrns(params?: GrnListQuery) {
	return api.get<GrnListResultV2>(
		`${API_ROUTES.grn.list}${toQueryString(params)}`,
	);
}

export function getGrnById(grnId: number) {
	return api.get<GrnDetailResult>(API_ROUTES.grn.detail(grnId));
}

export function createGrn(payload: GrnCreatePayload) {
	return api.post<GrnCreateResult, GrnCreatePayload>(
		API_ROUTES.grn.create,
		payload,
	);
}

export function updateGrn(payload: GrnUpdatePayload) {
	return api.patch<GrnUpdateResult, GrnUpdatePayload>(
		API_ROUTES.grn.update,
		payload,
	);
}

export function deleteGrn(grnId: number) {
	return api.delete<GrnDeleteResult>(API_ROUTES.grn.remove(grnId));
}

export function decideGrnLineQa(
	grnId: number,
	lineId: number,
	payload: GrnQaDecisionPayload,
) {
	return api.post<GrnLineActionResult, GrnQaDecisionPayload>(
		API_ROUTES.grn.qaDecision(grnId, lineId),
		payload,
	);
}

export function bypassGrnLineQa(
	grnId: number,
	lineId: number,
	payload: GrnBypassPayload,
) {
	return api.post<GrnLineActionResult, GrnBypassPayload>(
		API_ROUTES.grn.bypass(grnId, lineId),
		payload,
	);
}

export function correctGrnLine(
	grnId: number,
	lineId: number,
	payload: GrnCorrectionPayload,
) {
	return api.post<GrnCorrectionResult, GrnCorrectionPayload>(
		API_ROUTES.grn.correction(grnId, lineId),
		payload,
	);
}

export function getReceivablePos(params?: ReceivableParams) {
	return api.get<ReceivableResult>(
		`${API_ROUTES.grn.receivable}${toQueryString(params)}`,
	);
}
