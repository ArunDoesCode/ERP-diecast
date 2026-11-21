import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	Customer,
	CustomerCreatePayload,
	CustomerListParams,
	CustomerUpdatePayload,
	DataResponse,
	PagedResponse,
} from "@/types/customer";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getCustomers(params?: CustomerListParams) {
	return api.get<PagedResponse<Customer>>(
		`${API_ROUTES.customers.list}${toQueryString(params)}`,
	);
}

export function getCustomer(customerId: number) {
	return api.get<DataResponse<Customer>>(
		API_ROUTES.customers.detail(customerId),
	);
}

export function createCustomer(payload: CustomerCreatePayload) {
	return api.post<DataResponse<Customer>, CustomerCreatePayload>(
		API_ROUTES.customers.create,
		payload,
	);
}

export function updateCustomer(
	customerId: number,
	payload: CustomerUpdatePayload,
) {
	return api.patch<DataResponse<Customer>, CustomerUpdatePayload>(
		API_ROUTES.customers.update(customerId),
		payload,
	);
}
