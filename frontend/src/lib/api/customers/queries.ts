"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import type {
	CustomerCreatePayload,
	CustomerListParams,
	CustomerUpdatePayload,
} from "@/types/customer";

import {
	createCustomer,
	getCustomer,
	getCustomers,
	updateCustomer,
} from "./fetchers";

export const customerKeys = {
	all: ["customers"] as const,
	list: (params?: CustomerListParams) =>
		["customers", "list", params ?? {}] as const,
	detail: (customerId: number) => ["customers", "detail", customerId] as const,
};

export function customerErrorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useCustomersQuery(params: CustomerListParams, enabled = true) {
	return useQuery({
		queryKey: customerKeys.list(params),
		queryFn: () => getCustomers(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useCustomerQuery(customerId: number | undefined) {
	return useQuery({
		queryKey: customerKeys.detail(customerId ?? 0),
		queryFn: () => getCustomer(customerId as number),
		enabled: customerId !== undefined && customerId > 0,
	});
}

export function useCreateCustomerMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CustomerCreatePayload) => createCustomer(payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: customerKeys.all });
			toast.success("Customer saved");
		},
		// 400 / 409 CUSTOMER_NAME_EXISTS are shown under the fields by the form.
	});
}

export function useUpdateCustomerMutation(customerId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CustomerUpdatePayload) =>
			updateCustomer(customerId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: customerKeys.all });
			toast.success("Customer saved");
		},
	});
}

/** Row-menu Activate / Deactivate (id is per call, so one hook serves the list). */
export function useSetCustomerActiveMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: number; isActive: boolean }) =>
			updateCustomer(input.id, { isActive: input.isActive }),
		onSuccess: (_result, input) => {
			void queryClient.invalidateQueries({ queryKey: customerKeys.all });
			toast.success(
				input.isActive ? "Customer activated" : "Customer deactivated",
			);
		},
		onError: (error) => {
			toast.error(
				customerErrorMessage(error, "Could not update the customer."),
			);
		},
	});
}
