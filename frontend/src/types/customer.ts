// Customer API types. Source: .pipeline/scm-sale-order/contract.md (Customers).
import type { PaginationMeta } from "@/types/suppliers";

export type Customer = {
	id: number;
	name: string;
	stateCode: string;
	address: string;
	gstin: string | null;
	isActive: boolean;
	createdAt: string;
	lastUpdatedAt: string;
};

export type CustomerListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "name" | "createdAt";
	sortDir?: "asc" | "desc";
	q?: string;
	isActive?: boolean;
	stateCode?: string;
};

export type CustomerCreatePayload = {
	name: string;
	stateCode: string;
	address: string;
	gstin?: string;
};

export type CustomerUpdatePayload = Partial<{
	name: string;
	stateCode: string;
	address: string;
	gstin: string | null;
	isActive: boolean;
}>;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export const CUSTOMER_NAME_MAX = 120;
export const CUSTOMER_ADDRESS_MAX = 300;

/** GST state codes (two digits) with names; the select shows "Karnataka (29)". */
export const GST_STATES: readonly { code: string; name: string }[] = [
	{ code: "01", name: "Jammu and Kashmir" },
	{ code: "02", name: "Himachal Pradesh" },
	{ code: "03", name: "Punjab" },
	{ code: "04", name: "Chandigarh" },
	{ code: "05", name: "Uttarakhand" },
	{ code: "06", name: "Haryana" },
	{ code: "07", name: "Delhi" },
	{ code: "08", name: "Rajasthan" },
	{ code: "09", name: "Uttar Pradesh" },
	{ code: "10", name: "Bihar" },
	{ code: "11", name: "Sikkim" },
	{ code: "12", name: "Arunachal Pradesh" },
	{ code: "13", name: "Nagaland" },
	{ code: "14", name: "Manipur" },
	{ code: "15", name: "Mizoram" },
	{ code: "16", name: "Tripura" },
	{ code: "17", name: "Meghalaya" },
	{ code: "18", name: "Assam" },
	{ code: "19", name: "West Bengal" },
	{ code: "20", name: "Jharkhand" },
	{ code: "21", name: "Odisha" },
	{ code: "22", name: "Chhattisgarh" },
	{ code: "23", name: "Madhya Pradesh" },
	{ code: "24", name: "Gujarat" },
	{ code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
	{ code: "27", name: "Maharashtra" },
	{ code: "29", name: "Karnataka" },
	{ code: "30", name: "Goa" },
	{ code: "31", name: "Lakshadweep" },
	{ code: "32", name: "Kerala" },
	{ code: "33", name: "Tamil Nadu" },
	{ code: "34", name: "Puducherry" },
	{ code: "35", name: "Andaman and Nicobar Islands" },
	{ code: "36", name: "Telangana" },
	{ code: "37", name: "Andhra Pradesh" },
	{ code: "38", name: "Ladakh" },
];

export function stateName(code: string | null | undefined) {
	if (!code) return "–";
	return GST_STATES.find((s) => s.code === code)?.name ?? code;
}

export function stateLabel(state: { code: string; name: string }) {
	return `${state.name} (${state.code})`;
}

/** Same pattern the backend uses for a GSTIN (15 chars). */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
