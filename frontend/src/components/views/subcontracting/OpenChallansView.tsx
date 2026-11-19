"use client";

import { IconFileOff } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { ChallanDueBadge } from "@/components/pages/subcontracting/ChallanDueBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { useOpenChallansQuery } from "@/lib/api/subcontracting/queries";
import { formatDate, formatDocNo, formatMoney } from "@/lib/format";
import type { Challan, ChallanDueStatus } from "@/types/subcontracting";

type DueFilter = "all" | ChallanDueStatus;

const QUICK: Array<{ key: DueFilter; label: string }> = [
	{ key: "all", label: "All open" },
	{ key: "warning", label: "Due within 60 days" },
	{ key: "overdue", label: "Overdue" },
	{ key: "ok", label: "On track" },
];

const columns: DataTableColumnDef<Challan>[] = [
	{
		accessorKey: "challanNumber",
		header: "Challan no.",
		cell: ({ row }) => (
			<Link
				href={`/subcontracting/challans/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{formatDocNo(row.original.challanNumber)}
			</Link>
		),
	},
	{
		accessorKey: "scoNumber",
		header: "SCO no.",
		cell: ({ row }) => (
			<Link
				href={`/subcontracting/${row.original.scoId}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{formatDocNo(row.original.scoNumber)}
			</Link>
		),
	},
	{ accessorKey: "vendorName", header: "Vendor" },
	{
		accessorKey: "challanDate",
		header: "Date",
		cell: ({ row }) => formatDate(row.original.challanDate),
	},
	{
		accessorKey: "valuePaise",
		header: "Value",
		meta: { numeric: true },
		cell: ({ row }) => formatMoney(row.original.valuePaise),
	},
	{
		accessorKey: "returnDueDate",
		header: "Return due",
		cell: ({ row }) => (
			<span className="inline-flex flex-wrap items-center gap-2">
				<span>{formatDate(row.original.returnDueDate)}</span>
				<ChallanDueBadge challan={row.original} />
			</span>
		),
	},
];

export function OpenChallansView() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [dueStatus, setDueStatus] = useState<DueFilter>("all");

	const query = useOpenChallansQuery({
		page,
		pageSize,
		sortBy: "returnDueDate",
		sortDir: "asc",
		dueStatus: dueStatus === "all" ? undefined : dueStatus,
	});
	const challans = useMemo(() => query.data?.data ?? [], [query.data]);

	const table = useTable({
		features: dataTableFeatures,
		data: challans,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const changeDue = (key: string) => {
		setDueStatus(key as DueFilter);
		setPage(1);
	};

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Open challans"
				description="Material at vendors that has not come back. Return within 1 year of the challan date, otherwise it counts as a supply."
			/>

			<FilterBar
				quick={QUICK}
				value={dueStatus}
				onChange={changeDue}
				onReset={() => changeDue("all")}
			/>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					dueStatus === "all" ? (
						<EmptyState icon={IconFileOff} title="No open challans" />
					) : (
						<EmptyState
							icon={IconFileOff}
							title="Nothing matches these filters"
							action={
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => changeDue("all")}
								>
									Reset filters
								</Button>
							}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={
								query.error instanceof Error
									? query.error.message
									: "The list could not be loaded."
							}
							onRetry={() => {
								void query.refetch();
							}}
							retrying={query.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={page}
				pageSize={pageSize}
				total={query.data?.meta.total ?? 0}
				onPageChange={setPage}
				onPageSizeChange={(next) => {
					setPageSize(next);
					setPage(1);
				}}
			/>
		</div>
	);
}
