"use client";

import { CustomerForm } from "@/components/pages/customers/CustomerForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	customerErrorMessage,
	useCustomerQuery,
} from "@/lib/api/customers/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

export function CustomerFormView({ customerId }: { customerId?: number }) {
	const canManage = useCan("customer.manage");
	const query = useCustomerQuery(customerId);
	const customer = query.data?.data;
	useBreadcrumbLast(customerId === undefined ? "Add customer" : customer?.name);

	if (!canManage) {
		return (
			<EmptyState title="You do not have permission to add or edit customers" />
		);
	}
	if (customerId === undefined) return <CustomerForm />;

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !customer) {
		return (
			<ErrorState
				message={customerErrorMessage(query.error, "Customer not found")}
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}
	return (
		<CustomerForm
			key={`${customer.id}-${customer.lastUpdatedAt}`}
			existing={customer}
		/>
	);
}
