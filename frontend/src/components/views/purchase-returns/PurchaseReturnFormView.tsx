"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ReturnForm } from "@/components/pages/purchase-returns/ReturnForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	prtErrorMessage,
	usePurchaseReturnQuery,
	useReturnPrefillQuery,
} from "@/lib/api/purchase-return/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

/** New return (`grnId`, prefilled from the GRN) or edit a draft (`returnId`). */
export function PurchaseReturnFormView({
	grnId,
	returnId,
}: {
	grnId?: number;
	returnId?: number;
}) {
	const router = useRouter();
	const canEdit = useCan("purchase_return.edit_draft");
	const detailQuery = usePurchaseReturnQuery(returnId);
	const existing = detailQuery.data?.data;
	const sourceGrnId = returnId === undefined ? grnId : existing?.grnId;
	const prefillQuery = useReturnPrefillQuery(sourceGrnId, canEdit);
	const prefill = prefillQuery.data?.data;
	useBreadcrumbLast(
		returnId === undefined ? "New return" : existing?.proNumber,
	);

	// Only drafts can be edited: anything else goes to the detail page.
	const status = existing?.status;
	useEffect(() => {
		if (returnId !== undefined && status !== undefined && status !== "draft") {
			router.replace(`/purchase-returns/${returnId}`);
		}
	}, [router, returnId, status]);

	if (!canEdit) {
		return <EmptyState title="You can't create returns" />;
	}
	if (returnId === undefined && grnId === undefined) {
		return (
			<EmptyState
				title="Pick a GRN to return from"
				description="A return starts from a goods receipt."
				action={
					<Button type="button" size="sm" asChild>
						<Link href="/purchase-returns?tab=awaiting">Awaiting return</Link>
					</Button>
				}
			/>
		);
	}

	const loading =
		(returnId !== undefined && detailQuery.isLoading) ||
		(sourceGrnId !== undefined && prefillQuery.isLoading) ||
		(returnId !== undefined && !existing && !detailQuery.isError);
	if (loading) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}

	const failed = detailQuery.isError
		? detailQuery
		: prefillQuery.isError
			? prefillQuery
			: null;
	if (failed || !prefill) {
		const query = failed ?? prefillQuery;
		return (
			<ErrorState
				message={prtErrorMessage(
					query.error,
					"The return could not be loaded.",
				)}
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}
	if (existing && existing.status !== "draft") return null;

	if (!existing && prefill.mainAction === "none") {
		return (
			<EmptyState
				title="Nothing left to return on this GRN"
				action={
					<Button type="button" variant="outline" size="sm" asChild>
						<Link href={`/grn/${prefill.grnId}`}>
							Back to {prefill.grnNumber}
						</Link>
					</Button>
				}
			/>
		);
	}

	return (
		<ReturnForm
			key={
				existing ? `${existing.id}-${existing.lastUpdatedAt}` : prefill.grnId
			}
			prefill={prefill}
			existing={existing}
		/>
	);
}
