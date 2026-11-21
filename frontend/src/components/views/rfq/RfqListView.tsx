"use client";

import { IconFileOff, IconSearch } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { SupplierFilter } from "@/components/pages/rfq/SupplierPicker";
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
	RFQ_TABS,
	useRfqControls,
} from "@/components/views/rfq/use-rfq-controls";
import { useCan } from "@/hooks/use-can";
import { rfqErrorMessage, useRfqsQuery } from "@/lib/api/rfq/queries";
import { formatDate } from "@/lib/format";
import { istTodayIso } from "@/lib/ist-date";
import { cn } from "@/lib/utils";
import type { RfqListRow } from "@/types/rfq";

const OPEN_STATUSES = ["draft", "sent", "partially_awarded"];

const columns: DataTableColumnDef<RfqListRow>[] = [
	{
		accessorKey: "rfqNumber",
		header: "RFQ no.",
		cell: ({ row }) => (
			<Link
				href={`/rfq/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.rfqNumber}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="rfq" status={row.original.status} />,
	},
	{
		id: "suppliers",
		header: "Suppliers",
		cell: ({ row }) =>
			row.original.status === "draft"
				? `${row.original.supplierCount}`
				: `${row.original.quotedCount} of ${row.original.supplierCount} quoted`,
	},
	{
		accessorKey: "lineCount",
		header: "Lines",
		meta: { numeric: true },
	},
	{
		accessorKey: "dueDate",
		header: "Quote due",
		cell: ({ row }) => {
			const late =
				OPEN_STATUSES.includes(row.original.status) &&
				row.original.dueDate < istTodayIso();
			return (
				<span className={cn(late && "text-destructive")}>
					{formatDate(row.original.dueDate)}
				</span>
			);
		},
	},
	{
		accessorKey: "createdByName",
		header: "Created by",
		cell: ({ row }) => row.original.createdByName ?? "-",
	},
	{
		accessorKey: "createdAt",
		header: "Created on",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

export function RfqListView() {
	const canView = useCan("rfq.view");
	const canManage = useCan("rfq.manage");
	const controls = useRfqControls();

	const query = useRfqsQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			sortBy: "createdAt",
			sortDir: "desc",
			status: controls.tab === "all" ? undefined : controls.tab,
			supplierId: controls.supplierId,
			q: controls.q,
		},
		canView,
	);
	const rows = useMemo(() => query.data?.data ?? [], [query.data]);

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	if (!canView) {
		return <NoAccessState what="requests for quotation" />;
	}

	const total = query.data?.meta.total ?? 0;
	const newButton = canManage ? (
		<Button type="button" asChild>
			<Link href="/rfq/new">New RFQ</Link>
		</Button>
	) : undefined;

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Requests for quotation"
				description="Ask suppliers to quote on requisition lines, compare, and award."
				actions={newButton}
			/>

			<FilterBar
				quick={RFQ_TABS.map((entry) => ({ ...entry }))}
				value={controls.tab}
				onChange={controls.onTabChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<SupplierFilter
					value={controls.supplierId}
					onChange={controls.onSupplierChange}
				/>
				<div className="relative w-64">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						maxLength={100}
						placeholder="Search RFQ no. or notes"
						aria-label="Search RFQs"
						className="pl-7"
					/>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					controls.filtersActive || controls.tab !== "all" ? (
						<EmptyState
							icon={IconFileOff}
							title="Nothing matches these filters"
							action={
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={controls.reset}
								>
									Reset filters
								</Button>
							}
						/>
					) : (
						<EmptyState
							icon={IconFileOff}
							title="No RFQs yet. Start one from an approved requisition."
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={rfqErrorMessage(
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
				total={total}
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>
		</div>
	);
}
