"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SaleOrderForm } from "@/components/pages/sale-orders/SaleOrderForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	soErrorMessage,
	useSaleOrderQuery,
} from "@/lib/api/sale-order/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

export function SaleOrderFormView({ soId }: { soId?: number }) {
	const router = useRouter();
	const canManage = useCan("so.manage");
	const query = useSaleOrderQuery(soId);
	const so = query.data?.data;
	useBreadcrumbLast(soId === undefined ? "New sale order" : so?.soNumber);

	// On hold / closed / cancelled orders cannot be edited: go to the detail page.
	const status = so?.status;
	useEffect(() => {
		if (
			soId !== undefined &&
			status !== undefined &&
			status !== "draft" &&
			status !== "confirmed"
		) {
			router.replace(`/sale-orders/${soId}`);
		}
	}, [router, soId, status]);

	if (!canManage) {
		return (
			<EmptyState title="You do not have permission to create or edit sale orders" />
		);
	}
	if (soId === undefined) return <SaleOrderForm />;

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !so) {
		return (
			<ErrorState
				message={soErrorMessage(query.error, "Sale order not found")}
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}
	if (so.status !== "draft" && so.status !== "confirmed") return null;
	// key resets local form state after a reload under a new edit version.
	return (
		<SaleOrderForm
			key={`${so.id}-${so.editVersion}`}
			existing={so}
			onReload={() => {
				void query.refetch();
			}}
		/>
	);
}
