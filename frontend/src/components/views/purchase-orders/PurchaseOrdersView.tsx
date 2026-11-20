"use client";

import { IconFileOff, IconListCheck, IconSearch } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	type POQueueSearchField,
	type POQueueStatusFilter,
	usePOQueueControls,
} from "@/components/views/purchase-orders/use-po-queue-controls";
import { useCan } from "@/hooks/use-can";
import { usePurchaseRequisitionsQuery } from "@/lib/api/purchase-requisitions/queries";
import { formatDate, formatDocNo, formatMoney } from "@/lib/format";
import type { StatusCounts } from "@/types/purchase-orders";
import {
	type PRStatus,
	type PRType,
	type PurchaseRequisition,
	prTypeValues,
} from "@/types/purchase-requisitions";

const QUEUE_STATUSES: PRStatus[] = ["approved", "partial_ordered"];

const columns: DataTableColumnDef<PurchaseRequisition>[] = [
	{
		accessorKey: "prNumber",
		header: "PR no.",
		cell: ({ row }) => (
			<Link
				href={`/purchase-orders/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{formatDocNo(row.original.prNumber)}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="pr" status={row.original.status} />,
	},
	{ accessorKey: "type", header: "Type" },
	{
		accessorKey: "notes",
		header: "Notes",
		cell: ({ row }) => (
			<span className="line-clamp-1 max-w-xs text-muted-foreground">
				{row.original.notes?.trim() || "–"}
			</span>
		),
	},
	{
		accessorKey: "estimatedAmountPaise",
		header: "Estimated value",
		meta: { numeric: true },
		cell: ({ row }) => formatMoney(row.original.estimatedAmountPaise),
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

export function PurchaseOrdersView() {
	const canSeeTracking = useCan("po.manage");

	const {
		filtersActive,
		onPRNumberChange,
		onPageSizeChange,
		onSearchFieldChange,
		onSortDirectionChange,
		onStatusChange,
		onTypeFilterChange,
		page,
		pageSize,
		prNumberSearch,
		q,
		resetFilters,
		searchField,
		setPage,
		sortDir,
		status,
		typeFilter,
	} = usePOQueueControls();

	// BR-PR-48: the PR number search goes in `q`, the type in its own param.
	const queueQuery = usePurchaseRequisitionsQuery({
		page,
		pageSize,
		sortBy: "createdAt",
		sortDir,
		status: status === "all" ? QUEUE_STATUSES : [status],
		...(searchField === "prNumber"
			? { q }
			: typeFilter !== "all"
				? { type: typeFilter }
				: {}),
	});

	// BR-PO-26: the quick-filter counts come in the same answer's meta.
	const statusCounts = (
		queueQuery.data?.meta as
			| { statusCounts?: StatusCounts<PRStatus> }
			| undefined
	)?.statusCounts;
	const approved = statusCounts?.approved;
	const partial = statusCounts?.partial_ordered;

	const quick = [
		{
			key: "all",
			label: "All",
			count:
				approved !== undefined && partial !== undefined
					? approved + partial
					: undefined,
		},
		{ key: "approved", label: "Approved", count: approved },
		{ key: "partial_ordered", label: "Partly ordered", count: partial },
	];

	const requisitions = useMemo(
		() => queueQuery.data?.data ?? [],
		[queueQuery.data],
	);
	const total = queueQuery.data?.meta.total ?? 0;

	const table = useTable({
		features: dataTableFeatures,
		data: requisitions,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const emptyState = filtersActive ? (
		<EmptyState
			icon={IconFileOff}
			title="Nothing matches these filters"
			action={
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={resetFilters}
				>
					Reset filters
				</Button>
			}
		/>
	) : (
		<EmptyState
			icon={IconFileOff}
			title="No approved requisitions waiting for a purchase order"
			description="Approved requisitions show up here when they are ready to order."
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Purchase orders"
				description="Approved PR lines waiting for PO draft."
				actions={
					canSeeTracking ? (
						<Button type="button" variant="outline" size="sm" asChild>
							<Link href="/purchase-orders/tracking">
								<IconListCheck />
								PO tracking
							</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				quick={quick}
				value={status}
				onChange={(key) => onStatusChange(key as POQueueStatusFilter)}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<Select
					value={searchField}
					onValueChange={(value) =>
						onSearchFieldChange(value as POQueueSearchField)
					}
				>
					<SelectTrigger className="w-36" aria-label="Filter field">
						<SelectValue placeholder="Filter field" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="prNumber">PR Number</SelectItem>
						<SelectItem value="type">Type</SelectItem>
					</SelectContent>
				</Select>

				{searchField === "prNumber" ? (
					<div className="relative w-48">
						<IconSearch
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							value={prNumberSearch}
							onChange={(event) => onPRNumberChange(event.target.value)}
							placeholder="Search PR number"
							aria-label="Search PR number"
							className="pl-7"
						/>
					</div>
				) : (
					<Select
						value={typeFilter}
						onValueChange={(value) =>
							onTypeFilterChange(value as "all" | PRType)
						}
					>
						<SelectTrigger className="w-40" aria-label="Type">
							<SelectValue placeholder="Select type" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All types</SelectItem>
							{prTypeValues.map((type) => (
								<SelectItem key={type} value={type}>
									{type}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>Asc</span>
					<Switch
						checked={sortDir === "desc"}
						onCheckedChange={onSortDirectionChange}
						aria-label="Toggle sort direction"
					/>
					<span>Dsc</span>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={queueQuery.isLoading}
				hidePagination
				emptyState={emptyState}
				errorState={
					queueQuery.isError ? (
						<ErrorState
							message={
								queueQuery.error instanceof Error
									? queueQuery.error.message
									: "The list could not be loaded."
							}
							onRetry={() => {
								void queueQuery.refetch();
							}}
							retrying={queueQuery.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={page}
				pageSize={pageSize}
				total={total}
				onPageChange={setPage}
				onPageSizeChange={onPageSizeChange}
			/>
		</div>
	);
}
