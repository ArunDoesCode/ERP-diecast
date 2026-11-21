"use client";

import { IconFileOff, IconSearch } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { CheckNowButton } from "@/components/pages/reorder/CheckNowButton";
import { ReorderLastRunStrip } from "@/components/pages/reorder/ReorderLastRunStrip";
import { ReorderSettingsDialog } from "@/components/pages/reorder/ReorderSettingsDialog";
import { qtyText } from "@/components/pages/reorder/reorder-format";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	REORDER_STATE_QUICK,
	useReorderControls,
} from "@/components/views/reorder/use-reorder-controls";
import { useCan } from "@/hooks/use-can";
import {
	reorderErrorMessage,
	useReorderItemsQuery,
} from "@/lib/api/reorder/queries";
import type { ReorderItemRow, ReorderStateCounts } from "@/types/reorder";

function coveredHref(row: ReorderItemRow) {
	const by = row.coveredBy;
	if (!by) return null;
	// A PO has no page of its own by id yet; its number shows as plain text.
	return by.type === "po" ? null : `/purchase-requisitions?prId=${by.id}`;
}

const columns: DataTableColumnDef<ReorderItemRow>[] = [
	{
		accessorKey: "sku",
		header: "SKU",
		cell: ({ row }) => (
			<Link
				href="/inventory/items"
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.sku}
			</Link>
		),
	},
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "uom", header: "Unit" },
	{
		accessorKey: "usableQty",
		header: "Usable",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.usableQty),
	},
	{
		accessorKey: "onTheWayQty",
		header: "On the way",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.onTheWayQty),
	},
	{
		accessorKey: "projectedQty",
		header: "Projected",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.projectedQty),
	},
	{
		accessorKey: "reorderLevel",
		header: "Reorder level",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.reorderLevel),
	},
	{
		accessorKey: "orderQty",
		header: "Order qty",
		meta: { numeric: true },
		cell: ({ row }) =>
			row.original.state === "will_be_ordered"
				? qtyText(row.original.orderQty)
				: "–",
	},
	{
		accessorKey: "state",
		header: "State",
		cell: ({ row }) => {
			const href = coveredHref(row.original);
			return (
				<span className="flex flex-wrap items-center gap-2">
					<StatusBadge doc="reorderItem" status={row.original.state} />
					{row.original.coveredBy ? (
						href ? (
							<Link
								href={href}
								className="font-mono text-brand-accent hover:underline"
							>
								{row.original.coveredBy.number}
							</Link>
						) : (
							<span className="font-mono">{row.original.coveredBy.number}</span>
						)
					) : null}
				</span>
			);
		},
	},
];

export function ReorderListView() {
	const canManage = useCan("reorder.manage");
	const canManageItems = useCan("asset.manage");
	const controls = useReorderControls();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const query = useReorderItemsQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		sortBy: "sku",
		sortDir: "asc",
		state: controls.stateParam,
		q: controls.q,
	});

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const counts: ReorderStateCounts | undefined = query.data?.meta.stateCounts;
	const countFor = (key: string) =>
		counts
			? key === "all"
				? Object.values(counts).reduce((sum, n) => sum + n, 0)
				: counts[key as keyof ReorderStateCounts]
			: undefined;
	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const noItemHasLevel = countFor("all") === 0 && !controls.q;
	const emptyState = noItemHasLevel ? (
		<EmptyState
			icon={IconFileOff}
			title="No item has a reorder level yet"
			action={
				canManageItems ? (
					<Button type="button" size="sm" variant="outline" asChild>
						<Link href="/inventory/items">Open items</Link>
					</Button>
				) : undefined
			}
		/>
	) : controls.state === "will_be_ordered" && !controls.q ? (
		<EmptyState
			icon={IconFileOff}
			title="Nothing is low right now"
			action={
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={controls.showAll}
				>
					Show All
				</Button>
			}
		/>
	) : (
		<EmptyState
			icon={IconFileOff}
			title="Nothing matches these filters"
			action={
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={controls.reset}
				>
					Reset filters
				</Button>
			}
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Reorder"
				description="What is low now, and what the next check will raise."
				actions={
					canManage ? (
						<>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setSettingsOpen(true)}
							>
								Settings
							</Button>
							<CheckNowButton />
						</>
					) : undefined
				}
			/>

			<ReorderLastRunStrip onChooseOwner={() => setSettingsOpen(true)} />

			<FilterBar
				quick={REORDER_STATE_QUICK.map((entry) => ({
					...entry,
					count: countFor(entry.key),
				}))}
				value={controls.state}
				onChange={controls.onStateChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<div className="relative w-64">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						placeholder="Search SKU or name"
						aria-label="Search SKU or name"
						className="pl-7"
					/>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={emptyState}
				errorState={
					query.isError ? (
						<ErrorState
							message={reorderErrorMessage(
								query.error,
								"The list could not be loaded.",
							)}
							onRetry={() => {
								void query.refetch();
							}}
							retrying={query.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={controls.page}
				pageSize={controls.pageSize}
				total={query.data?.meta.total ?? 0}
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>

			{canManage && settingsOpen ? (
				<ReorderSettingsDialog
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
				/>
			) : null}
		</div>
	);
}
