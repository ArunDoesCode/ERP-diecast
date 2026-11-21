"use client";

import {
	IconAlertTriangle,
	IconFileOff,
	IconPlus,
	IconSearch,
	IconX,
} from "@tabler/icons-react";
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
import type { PrGroup } from "@/components/views/purchase-requisitions/use-pr-list-controls";
import { usePRListControls } from "@/components/views/purchase-requisitions/use-pr-list-controls";
import { useCan } from "@/hooks/use-can";
import type {
	PrListQuery,
	PrListRowV2,
	PrListSortField,
} from "@/lib/api/purchase-requisitions/list-types";
import { usePurchaseRequisitionsQuery } from "@/lib/api/purchase-requisitions/queries";
import { formatDate, formatDocNo, formatMoney } from "@/lib/format";

const SORT_FIELDS: Array<{ label: string; value: PrListSortField }> = [
	{ label: "Newest first", value: "createdAt" },
	{ label: "PR number", value: "prNumber" },
	{ label: "Type", value: "type" },
	{ label: "Status", value: "status" },
	{ label: "Estimate", value: "estimatedAmountPaise" },
];

const BUCKET_LABEL = { late: "Late", today: "Today", later: "Later" } as const;

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const TYPE_LABEL: Record<string, string> = {
	sale_order: "Sale order",
	stock_reorder: "Stock reorder",
	maintenance: "Maintenance",
	tooling: "Tooling",
	subcontracting: "Subcontracting",
	misc: "Miscellaneous",
};

function makeColumns(canSeeEstimate: boolean, today: string) {
	const columns: DataTableColumnDef<PrListRowV2>[] = [
		{
			accessorKey: "prNumber",
			header: "PR no.",
			cell: ({ row }) => (
				<Link
					href={`/purchase-requisitions/${row.original.id}`}
					className="cursor-pointer font-mono text-brand-accent hover:underline"
				>
					{formatDocNo(row.original.prNumber)}
				</Link>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Date",
			cell: ({ row }) => formatDate(row.original.createdAt),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => TYPE_LABEL[row.original.type] ?? row.original.type,
		},
		{
			id: "requester",
			header: "Requester",
			cell: ({ row }) => row.original.requestedByName ?? "–",
		},
		{
			accessorKey: "lineCount",
			header: "Lines",
			meta: { numeric: true },
			cell: ({ row }) => row.original.lineCount ?? "–",
		},
	];
	if (canSeeEstimate) {
		columns.push({
			accessorKey: "estimatedAmountPaise",
			header: "Estimate",
			meta: { numeric: true },
			cell: ({ row }) => formatMoney(row.original.estimatedAmountPaise),
		});
	}
	columns.push(
		{
			id: "requiredBy",
			header: "Required by",
			cell: ({ row }) => {
				const date = row.original.earliestRequiredBy;
				if (!date) return "–";
				const waiting =
					row.original.status === "approved" ||
					row.original.status === "partial_ordered";
				const late = waiting && date < today;
				return late ? (
					<span className="inline-flex items-center gap-1 font-medium text-destructive">
						<IconAlertTriangle className="size-3.5" aria-hidden="true" />
						{formatDate(date)}
						<span className="sr-only"> (late)</span>
					</span>
				) : (
					formatDate(date)
				);
			},
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge doc="pr" status={row.original.status} />,
		},
	);
	return columns;
}

export function PurchaseRequisitionsView() {
	const {
		bucket,
		clearBucket,
		clearMine,
		filtersActive,
		group,
		mine,
		onGroupChange,
		onPageSizeChange,
		onQChange,
		onSortByChange,
		onSortDirectionChange,
		page,
		pageSize,
		q,
		qInput,
		resetFilters,
		setPage,
		sortBy,
		sortDir,
		status,
		toOrder,
	} = usePRListControls();

	const canManage = useCan("pr.manage");

	const params: PrListQuery = {
		page,
		pageSize,
		q,
		status,
		mine: mine ? true : undefined,
		toOrder,
		bucket: bucket ?? undefined,
		sortBy,
		sortDir,
	};
	const requisitionsQuery = usePurchaseRequisitionsQuery(params);
	const result = requisitionsQuery.data;

	const requisitions = useMemo(() => result?.data ?? [], [result]);
	const total = result?.meta.total ?? 0;
	const counts = result?.meta.statusCounts;
	const toOrderCount = result?.meta.toOrderCount;

	// BR-FF-109 groups; they add up to All. Ordered = approved / partly / fully
	// ordered rows that are not still waiting for an order.
	const n = (key: keyof NonNullable<typeof counts>) => counts?.[key] ?? 0;
	const quick = [
		{
			key: "all",
			label: "All",
			count: counts
				? Object.values(counts).reduce((sum, v) => sum + (v ?? 0), 0)
				: undefined,
		},
		{ key: "draft", label: "Draft", count: counts ? n("draft") : undefined },
		{
			key: "in_approval",
			label: "In approval",
			count: counts ? n("pending_approval") : undefined,
		},
		{ key: "to_order", label: "To order", count: toOrderCount },
		{
			key: "ordered",
			label: "Ordered",
			count:
				counts && toOrderCount !== undefined
					? Math.max(
							0,
							n("approved") +
								n("partial_ordered") +
								n("fully_ordered") -
								toOrderCount,
						)
					: undefined,
		},
		{
			key: "closed",
			label: "Closed",
			count: counts ? n("rejected") + n("cancelled") : undefined,
		},
	];

	const today = IST_DAY.format(new Date());
	const columns = useMemo(
		() => makeColumns(canManage, today),
		[canManage, today],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: requisitions,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const newButton = canManage ? (
		<Button size="lg" asChild>
			<Link href="/purchase-requisitions/new">
				<IconPlus />
				New requisition
			</Link>
		</Button>
	) : undefined;

	const emptyState = filtersActive ? (
		<EmptyState
			icon={IconFileOff}
			title="Nothing matches these filters"
			action={
				<Button type="button" variant="outline" onClick={resetFilters}>
					Reset filters
				</Button>
			}
		/>
	) : (
		<EmptyState
			icon={IconFileOff}
			title="No purchase requisitions yet"
			action={newButton}
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Purchase requisitions"
				description="Ask for items to be bought, and follow each request to its order."
				actions={newButton}
			/>

			<FilterBar
				quick={quick}
				value={group ?? "all"}
				onChange={(key) =>
					onGroupChange(key === "all" ? null : (key as PrGroup))
				}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				{mine ? (
					<Button
						type="button"
						variant="outline"
						className="h-10"
						onClick={clearMine}
						aria-label="Show everyone's requisitions"
					>
						Mine only
						<IconX className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}
				{bucket ? (
					<Button
						type="button"
						variant="outline"
						className="h-10"
						onClick={clearBucket}
						aria-label={`Clear the ${bucket} filter`}
					>
						{BUCKET_LABEL[bucket]} only
						<IconX className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}

				<div className="relative w-56">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={qInput}
						onChange={(event) => onQChange(event.target.value)}
						placeholder="Search PR number or notes"
						aria-label="Search PR number or notes"
						className="h-10 pl-7"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Select
						value={sortBy}
						onValueChange={(value) => onSortByChange(value as PrListSortField)}
					>
						<SelectTrigger className="h-10 w-40" aria-label="Sort by">
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							{SORT_FIELDS.filter(
								(field) => canManage || field.value !== "estimatedAmountPaise",
							).map((field) => (
								<SelectItem key={field.value} value={field.value}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>Asc</span>
						<Switch
							checked={sortDir === "desc"}
							onCheckedChange={onSortDirectionChange}
							aria-label="Toggle sort direction"
						/>
						<span>Dsc</span>
					</div>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={requisitionsQuery.isLoading}
				hidePagination
				tight
				emptyState={emptyState}
				errorState={
					requisitionsQuery.isError ? (
						<ErrorState
							message={
								requisitionsQuery.error instanceof Error
									? requisitionsQuery.error.message
									: "The list could not be loaded."
							}
							onRetry={() => {
								void requisitionsQuery.refetch();
							}}
							retrying={requisitionsQuery.isRefetching}
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
