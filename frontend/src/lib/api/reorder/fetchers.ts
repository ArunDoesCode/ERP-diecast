import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ReorderDataResponse,
	ReorderItemRow,
	ReorderItemsParams,
	ReorderOwnerCandidatesParams,
	ReorderPagedResponse,
	ReorderPersonRef,
	ReorderRun,
	ReorderRunDetail,
	ReorderRunsParams,
	ReorderSettings,
	ReorderSettingsPayload,
	ReorderStateCounts,
} from "@/types/reorder";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getReorderItems(params?: ReorderItemsParams) {
	return api.get<
		ReorderPagedResponse<ReorderItemRow, { stateCounts?: ReorderStateCounts }>
	>(`${API_ROUTES.reorder.items}${toQueryString(params)}`);
}

export function getReorderRuns(params?: ReorderRunsParams) {
	return api.get<ReorderPagedResponse<ReorderRun>>(
		`${API_ROUTES.reorder.runs}${toQueryString(params)}`,
	);
}

export function getReorderRun(runId: number) {
	return api.get<ReorderDataResponse<ReorderRunDetail>>(
		API_ROUTES.reorder.runDetail(runId),
	);
}

export function checkReorderNow() {
	return api.post<ReorderDataResponse<ReorderRun>, Record<string, never>>(
		API_ROUTES.reorder.checkNow,
		{},
	);
}

export function getReorderSettings() {
	return api.get<ReorderDataResponse<ReorderSettings>>(
		API_ROUTES.reorder.settings,
	);
}

export function updateReorderSettings(payload: ReorderSettingsPayload) {
	return api.patch<
		ReorderDataResponse<ReorderSettings>,
		ReorderSettingsPayload
	>(API_ROUTES.reorder.settings, payload);
}

export function getReorderOwnerCandidates(
	params?: ReorderOwnerCandidatesParams,
) {
	return api.get<ReorderPagedResponse<ReorderPersonRef>>(
		`${API_ROUTES.reorder.ownerCandidates}${toQueryString(params)}`,
	);
}
