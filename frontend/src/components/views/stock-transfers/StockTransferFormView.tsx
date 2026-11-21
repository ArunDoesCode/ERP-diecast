"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import {
	TransferForm,
	type TransferPrefill,
} from "@/components/pages/stock-transfers/TransferForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useLocationsQuery, useStockQuery } from "@/lib/api/asset/queries";
import {
	stErrorMessage,
	useStockTransferQuery,
} from "@/lib/api/stock-transfer/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

/** New transfer (optional `item` + `from` prefill from the stock page) or edit a draft (`transferId`). */
export function StockTransferFormView({
	transferId,
	itemId,
	fromId,
}: {
	transferId?: number;
	itemId?: number;
	fromId?: number;
}) {
	const router = useRouter();
	const canManage = useCan("stock_transfer.manage");
	const detailQuery = useStockTransferQuery(canManage ? transferId : undefined);
	const existing = detailQuery.data?.data;
	useBreadcrumbLast(existing?.transferNumber);

	const locationsQuery = useLocationsQuery({
		page: 1,
		pageSize: 100,
		isActive: true,
	});
	const locations = useMemo(
		() =>
			(locationsQuery.data?.data ?? [])
				.filter((l) => l.isActive && l.type !== "vendor_premise")
				.map((l) => ({ id: l.id, name: l.name })),
		[locationsQuery.data],
	);

	// Prefill from the stock page: needs the item's name and unit, from the source's stock rows.
	const wantsPrefill =
		transferId === undefined && itemId !== undefined && fromId !== undefined;
	const prefillStock = useStockQuery(
		wantsPrefill ? { page: 1, pageSize: 100, locationId: fromId } : undefined,
		wantsPrefill,
	);

	// Only drafts can be edited: anything else goes to the detail page.
	const status = existing?.status;
	useEffect(() => {
		if (
			transferId !== undefined &&
			status !== undefined &&
			status !== "draft"
		) {
			toast.info("Only a draft can be edited");
			router.replace(`/inventory/stock-transfers/${transferId}`);
		}
	}, [router, transferId, status]);

	if (!canManage) {
		return (
			<div className="flex w-full flex-col gap-4">
				<PageHeader
					title={transferId === undefined ? "New transfer" : "Edit transfer"}
				/>
				<EmptyState
					title="You can't create transfers"
					action={
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href="/inventory/stock-transfers">
								Back to stock transfers
							</Link>
						</Button>
					}
				/>
			</div>
		);
	}

	const loading =
		locationsQuery.isLoading ||
		(transferId !== undefined && !existing && !detailQuery.isError) ||
		(wantsPrefill && prefillStock.isLoading);
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
		: locationsQuery.isError
			? locationsQuery
			: null;
	if (failed) {
		return (
			<ErrorState
				message={stErrorMessage(
					failed.error,
					"The transfer could not be loaded.",
				)}
				onRetry={() => {
					void failed.refetch();
				}}
				retrying={failed.isRefetching}
			/>
		);
	}
	if (existing && existing.status !== "draft") return null;

	// An unknown or inactive id in the link is ignored (blank form).
	let prefill: TransferPrefill | undefined;
	if (wantsPrefill && locations.some((l) => l.id === fromId)) {
		const stockRow = prefillStock.data?.data.find((r) => r.itemId === itemId);
		prefill = {
			sourceId: fromId,
			item: stockRow?.isActive
				? {
						id: stockRow.itemId,
						label: `${stockRow.sku} · ${stockRow.name}`,
						unit: stockRow.uom,
					}
				: undefined,
		};
	}

	return (
		<TransferForm
			key={
				existing
					? `${existing.id}-${existing.lastUpdatedAt}`
					: `new-${fromId ?? 0}-${itemId ?? 0}`
			}
			locations={locations}
			existing={existing}
			prefill={prefill}
		/>
	);
}
