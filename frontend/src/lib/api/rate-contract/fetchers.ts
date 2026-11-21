import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ContractBody,
	ContractDetails,
	ContractListParams,
	ContractListRow,
	ContractReasonPayload,
	ContractTerminatePayload,
	ContractUpdatePayload,
	DataResponse,
	PagedResponse,
} from "@/types/rate-contract";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

type Empty = Record<string, never>;

export function getContracts(params?: ContractListParams) {
	return api.get<PagedResponse<ContractListRow>>(
		`${API_ROUTES.rateContracts.list}${toQueryString(params)}`,
	);
}

export function getContract(id: number) {
	return api.get<DataResponse<ContractDetails>>(
		API_ROUTES.rateContracts.detail(id),
	);
}

export function createContract(payload: ContractBody) {
	return api.post<DataResponse<ContractDetails>, ContractBody>(
		API_ROUTES.rateContracts.create,
		payload,
	);
}

export function updateContract(payload: ContractUpdatePayload) {
	return api.patch<DataResponse<ContractDetails>, ContractUpdatePayload>(
		API_ROUTES.rateContracts.update,
		payload,
	);
}

export function activateContract(id: number) {
	return api.post<DataResponse<ContractDetails>, Empty>(
		API_ROUTES.rateContracts.activate(id),
		{},
	);
}

export function terminateContract(
	id: number,
	payload: ContractTerminatePayload,
) {
	return api.post<DataResponse<ContractDetails>, ContractTerminatePayload>(
		API_ROUTES.rateContracts.terminate(id),
		payload,
	);
}

export function cancelContract(id: number, payload: ContractReasonPayload) {
	return api.post<DataResponse<ContractDetails>, ContractReasonPayload>(
		API_ROUTES.rateContracts.cancel(id),
		payload,
	);
}
