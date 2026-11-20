import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	BomChangeSummary,
	BomCreatePayload,
	BomDeleteResult,
	BomDetail,
	BomHistoryParams,
	BomHistoryRow,
	BomListParams,
	BomListRow,
	BomNeeds,
	BomNeedsParams,
	BomReleasePayload,
	BomReleaseResult,
	BomRetirePayload,
	BomTreeNode,
	BomUpdatePayload,
	BomWhereUsedParams,
	BomWhereUsedRow,
	BomWriteResult,
	DataResponse,
	PagedResponse,
} from "@/types/bom";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getBoms(params?: BomListParams) {
	return api.get<PagedResponse<BomListRow>>(
		`${API_ROUTES.bom.list}${toQueryString(params)}`,
	);
}

export function getBom(bomId: number) {
	return api.get<DataResponse<BomDetail>>(API_ROUTES.bom.detail(bomId));
}

export function getBomTree(bomId: number) {
	return api.get<DataResponse<BomTreeNode>>(API_ROUTES.bom.tree(bomId));
}

export function getBomChangeSummary(bomId: number) {
	return api.get<DataResponse<BomChangeSummary>>(
		API_ROUTES.bom.changeSummary(bomId),
	);
}

export function getBomNeeds(params: BomNeedsParams) {
	return api.get<DataResponse<BomNeeds>>(
		`${API_ROUTES.bom.needs}${toQueryString(params)}`,
	);
}

export function getBomWhereUsed(itemId: number, params?: BomWhereUsedParams) {
	return api.get<PagedResponse<BomWhereUsedRow>>(
		`${API_ROUTES.bom.whereUsed(itemId)}${toQueryString(params)}`,
	);
}

export function getBomHistory(partId: number, params?: BomHistoryParams) {
	return api.get<PagedResponse<BomHistoryRow>>(
		`${API_ROUTES.bom.history(partId)}${toQueryString(params)}`,
	);
}

export function createBom(payload: BomCreatePayload) {
	return api.post<DataResponse<BomWriteResult>, BomCreatePayload>(
		API_ROUTES.bom.create,
		payload,
	);
}

export function updateBom(bomId: number, payload: BomUpdatePayload) {
	return api.patch<DataResponse<BomWriteResult>, BomUpdatePayload>(
		API_ROUTES.bom.update(bomId),
		payload,
	);
}

export function deleteBom(bomId: number) {
	return api.delete<DataResponse<BomDeleteResult>>(
		API_ROUTES.bom.remove(bomId),
	);
}

export function startBomRevision(partId: number) {
	return api.post<DataResponse<BomWriteResult>>(
		API_ROUTES.bom.startRevision(partId),
	);
}

export function releaseBom(bomId: number, payload: BomReleasePayload) {
	return api.post<DataResponse<BomReleaseResult>, BomReleasePayload>(
		API_ROUTES.bom.release(bomId),
		payload,
	);
}

export function retireBom(bomId: number, payload: BomRetirePayload) {
	return api.post<DataResponse<BomWriteResult>, BomRetirePayload>(
		API_ROUTES.bom.retire(bomId),
		payload,
	);
}
