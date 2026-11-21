"use client";

import { IconSearch, IconStarHalf } from "@tabler/icons-react";
import { type SortingState, useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { RatingLabelBadge } from "@/components/pages/supplier-rating/RatingLabelBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	RATING_STATUS_QUICK,
	useRatingListControls,
} from "@/components/views/supplier-ratings/use-rating-list-controls";
import { useCan } from "@/hooks/use-can";
import {
	ratingErrorStatus,
	useRatingListQuery,
} from "@/lib/api/supplier-rating/queries";
import { formatDate, formatPercentTenths } from "@/lib/format";
import type { Rating, RatingListSortField } from "@/types/supplier-rating";

const SORTABLE = new Set<string>([
	"name",
	"score",
	"onTimePct",
	"rejectionPct",
	"priceVariancePct",
	"judgedLines",
	"decidedLines",
]);

const columns: DataTableColumnDef<Rating>[] = [
	{
		id: "name",
		accessorFn: (r) => r.supplierName,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Supplier" />
		),
		cell: ({ row }) => (
			<span className="inline-flex flex-wrap items-center gap-2">
				<Link
					href={`/supplier-ratings/${row.original.supplierId}`}
					className="text-brand-accent hover:underline"
				>
					{row.original.supplierName}
				</Link>
				{row.original.isActive ? null : (
					<StatusBadge doc="supplier" status="inactive" />
				)}
			</span>
		),
	},
	{
		id: "score",
		accessorFn: (r) => r.score,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Score" />
		),
		cell: ({ row }) => row.original.score ?? "–",
		meta: { numeric: true },
	},
	{
		id: "label",
		header: "Label",
		enableSorting: false,
		cell: ({ row }) => <RatingLabelBadge rating={row.original} />,
	},
	{
		id: "onTimePct",
		accessorFn: (r) => r.onTime.pctTenths,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="On-time" />
		),
		cell: ({ row }) => formatPercentTenths(row.original.onTime.pctTenths),
		meta: { numeric: true },
	},
	{
		id: "lateLines",
		header: "Late lines",
		enableSorting: false,
		cell: ({ row }) => row.original.onTime.lateLines,
		meta: { numeric: true, hideBelow1100: true },
	},
	{
		id: "rejectionPct",
		accessorFn: (r) => r.rejection.pctTenths,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Rejection" />
		),
		cell: ({ row }) => formatPercentTenths(row.original.rejection.pctTenths),
		meta: { numeric: true },
	},
	{
		id: "decidedLines",
		accessorFn: (r) => r.rejection.decidedLines,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Lines with rejects" />
		),
		cell: ({ row }) =>
			`${row.original.rejection.linesWithRejects} of ${row.original.rejection.decidedLines}`,
		meta: { numeric: true, hideBelow1100: true },
	},
	{
		id: "notInspected",
		header: "Not inspected",
		enableSorting: false,
		cell: ({ row }) => row.original.rejection.notInspectedLines,
		meta: { numeric: true, hideBelow1100: true },
	},
	{
		id: "priceVariancePct",
		accessorFn: (r) => r.priceVariance.pctTenths,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Price variance" />
		),
		cell: ({ row }) =>
			formatPercentTenths(row.original.priceVariance.pctTenths, {
				signed: true,
			}),
		meta: { numeric: true },
	},
	{
		id: "judgedLines",
		accessorFn: (r) => r.onTime.lines,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Judged lines" />
		),
		cell: ({ row }) => row.original.onTime.lines,
		meta: { numeric: true, hideBelow1100: true },
	},
];

export function SupplierRatingListView() {
	const canView = useCan("supplier.rating.view");
	const c = useRatingListControls();

	const query = useRatingListQuery({
		page: c.page,
		pageSize: c.pageSize,
		status: c.status,
		q: c.q,
		sortBy: c.sortBy,
		sortDir: c.sortBy ? (c.sortDir ?? "asc") : undefined,
	});

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const meta = query.data?.meta;
	const sorting = useMemo<SortingState>(
		() => (c.sortBy ? [{ id: c.sortBy, desc: c.sortDir === "desc" }] : []),
		[c.sortBy, c.sortDir],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
		state: { sorting },
		onSortingChange: (updater) => {
			const next = typeof updater === "function" ? updater(sorting) : updater;
			const first = next[0];
			if (first && SORTABLE.has(first.id)) {
				c.onSortChange(
					first.id as RatingListSortField,
					first.desc ? "desc" : "asc",
				);
			} else {
				c.onSortChange(null, "asc");
			}
		},
	});

	if (!canView) return <NoAccessState what="supplier ratings" />;
	if (ratingErrorStatus(query.error) === 403) {
		return <NoAccessState what="supplier ratings" />;
	}

	const first = rows[0];
	const description = first
		? `Based on the last 12 months, ${formatDate(first.windowFrom)} to ${formatDate(first.windowTo)}. A score needs at least 5 judged and 5 inspected lines.`
		: "Based on the last 12 months of purchase orders and goods receipts.";

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader title="Supplier rating" description={description} />

			<FilterBar
				quick={RATING_STATUS_QUICK}
				value={c.status}
				onChange={c.onStatusChange}
				onReset={c.reset}
				filtersActive={c.filtersActive}
			>
				<div className="relative w-72">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={c.searchInput}
						onChange={(event) => c.onSearchChange(event.target.value)}
						placeholder="Search supplier"
						aria-label="Search suppliers"
						className="pl-7"
					/>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					c.filtersActive ? (
						<EmptyState
							icon={IconStarHalf}
							title="Nothing matches these filters"
							action={
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={c.reset}
								>
									Reset filters
								</Button>
							}
						/>
					) : (
						<EmptyState icon={IconStarHalf} title="No suppliers yet" />
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message="Failed to load supplier ratings."
							onRetry={() => {
								void query.refetch();
							}}
							retrying={query.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={c.page}
				pageSize={c.pageSize}
				total={meta?.total ?? 0}
				onPageChange={c.setPage}
				onPageSizeChange={c.onPageSizeChange}
			/>
		</div>
	);
}
