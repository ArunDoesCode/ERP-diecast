import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	CompanySettings,
	CompanySettingsPayload,
	CompanySettingsResult,
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
