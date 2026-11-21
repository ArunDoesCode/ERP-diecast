"use client";

import { IconFileOff } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { CheckNowButton } from "@/components/pages/reorder/CheckNowButton";
import {
	runNo,
	startedByText,
} from "@/components/pages/reorder/reorder-format";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	RUN_STATE_QUICK,
	useReorderRunsControls,
} from "@/components/views/reorder/use-reorder-controls";
import { useCan } from "@/hooks/use-can";
import {
	reorderErrorMessage,
	useReorderRunsQuery,
} from "@/lib/api/reorder/queries";
import { formatDateTime } from "@/lib/format";
import type { ReorderRun } from "@/types/reorder";

function dash(value: number, run: ReorderRun) {
	return run.state === "failed" ? "–" : value;
}

const columns: DataTableColumnDef<ReorderRun>[] = [
	{
		accessorKey: "id",
		header: "Run no.",
		cell: ({ row }) => (
			<Link
				href={`/inventory/reorder/runs/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{runNo(row.original.id)}
			</Link>
		),
	},
	{
		accessorKey: "state",
		header: "State",
		cell: ({ row }) => (
			<StatusBadge doc="reorderRun" status={row.original.state} />
		),
	},
	{
		accessorKey: "startedAt",
		header: "Started",
		cell: ({ row }) => (
			<span className="block max-w-28 whitespace-normal">
				{formatDateTime(row.original.startedAt)}
			</span>
		),
	},
	{
		id: "startedBy",
		header: "Started by",
		cell: ({ row }) => (
			<span className="block max-w-28 whitespace-normal">
				{startedByText(row.original)}
			</span>
		),
	},
	{
		accessorKey: "itemsChecked",
		header: "Checked",
		meta: { numeric: true },
		cell: ({ row }) => dash(row.original.itemsChecked, row.original),
	},
	{
		accessorKey: "itemsRaised",
		header: "Raised",
		meta: { numeric: true },
		cell: ({ row }) => dash(row.original.itemsRaised, row.original),
	},
	{
		accessorKey: "itemsSkipped",
		header: "Skipped",
		meta: { numeric: true },
		cell: ({ row }) => dash(row.original.itemsSkipped, row.original),
	},
	{
		id: "pr",
		header: "PR",
		cell: ({ row }) =>
			row.original.pr?.prNumber ? (
				<Link
					href={`/purchase-requisitions?prId=${row.original.pr.id}`}
					className="font-mono text-brand-accent hover:underline"
				>
					{row.original.pr.prNumber}
				</Link>
			) : (
				"–"
			),
	},
	{
		id: "reason",
		header: "Reason",
		cell: ({ row }) => {
			const run = row.original;
			const text =
				run.failureReason ??
				(run.state === "done" && !run.pr ? "Nothing to order" : null);
			return text ? (
				<span className="line-clamp-2 block max-w-40 whitespace-normal text-muted-foreground">
					{text}
				</span>
			) : (
				"–"
			);
		},
	},
];

export function ReorderRunsView() {
	const canManage = useCan("reorder.manage");
	const controls = useReorderRunsControls();
	const query = useReorderRunsQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		sortBy: "startedAt",
		sortDir: "desc",
		state: controls.stateParam,
		trigger: controls.triggerParam,
	});
	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Reorder runs"
				description="Every check, who started it and what it raised."
				actions={canManage ? <CheckNowButton /> : undefined}
			/>

			<FilterBar
				quick={RUN_STATE_QUICK.map((entry) => ({ ...entry }))}
				value={controls.state}
				onChange={controls.onStateChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<div className="flex items-center gap-2">
					<Label htmlFor="reorder-runs-trigger" className="text-sm">
						Started by
					</Label>
					<Select
						value={controls.trigger}
						onValueChange={controls.onTriggerChange}
					>
						<SelectTrigger id="reorder-runs-trigger" className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All</SelectItem>
							<SelectItem value="schedule">Daily schedule</SelectItem>
							<SelectItem value="manual">Manual</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					controls.filtersActive ? (
						<EmptyState
							icon={IconFileOff}
							title="Nothing matches these filters"
						/>
					) : (
						<EmptyState
							icon={IconFileOff}
							title="No check has run yet"
							action={canManage ? <CheckNowButton /> : undefined}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={reorderErrorMessage(
								query.error,
								"The runs could not be loaded.",
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
		</div>
	);
}
