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
import { useGrnTrackingControls } from "@/components/views/grn/use-grn-tracking-controls";
import { useCan } from "@/hooks/use-can";
import { useGrnsQuery } from "@/lib/api/grn/queries";
import { formatDate, formatDocNo } from "@/lib/format";
import { getStatusTone } from "@/lib/status-tone";
import {
	type GrnListRow,
	type GrnQaStatus,
	type GrnSortField,
	type GrnStatus,
	grnQaStatusValues,
	grnStatusValues,
} from "@/types/grn";

const SORT_FIELDS: Array<{ label: string; value: GrnSortField }> = [
	{ label: "ID", value: "id" },
	{ label: "GRN number", value: "grnNumber" },
	{ label: "Status", value: "status" },
	{ label: "Received date", value: "receivedDate" },
];

const columns: DataTableColumnDef<GrnListRow>[] = [
	{
		accessorKey: "grnNumber",
		header: "GRN no.",
		cell: ({ row }) => (
			<Link
				href={`/grn/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{formatDocNo(row.original.grnNumber)}
			</Link>
		),
	},
	{
		accessorKey: "poNumber",
		header: "PO",
		cell: ({ row }) =>
			row.original.poNumber ? (
				<span className="font-mono">{formatDocNo(row.original.poNumber)}</span>
			) : (
				"–"
			),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="grn" status={row.original.status} />,
	},
	{
		accessorKey: "receivedDate",
		header: "Received",
		cell: ({ row }) => formatDate(row.original.receivedDate),
	},
];

export function GrnView() {
	const canReceive = useCan("grn.edit_draft");
	const {
		filtersActive,
		onPageSizeChange,
		onQChange,
		onQaStatusFilterChange,
		onSortByChange,
		onSortDirectionChange,
		onStatusFilterChange,
		page,
		pageSize,
		q,
		qInput,
		qaStatus,
		qaStatusFilter,
		resetFilters,
		setPage,
		sortBy,
		sortDir,
		status,
		statusFilter,
	} = useGrnTrackingControls();

	const grnQuery = useGrnsQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		status,
		qaStatus,
		q,
	});

	const grns = useMemo(() => grnQuery.data?.data ?? [], [grnQuery.data]);
	const total = grnQuery.data?.meta.total ?? 0;

	const table = useTable({
		features: dataTableFeatures,
		data: grns,
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
			title="No goods receipts yet"
			description="A GRN shows up here when goods are received against a dispatched purchase order."
			action={
				canReceive ? (
					<Button asChild size="lg">
						<Link href="/grn/receive">Receive goods</Link>
					</Button>
				) : undefined
			}
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Goods receipt notes"
				description="Track goods received against dispatched purchase orders."
				actions={
					canReceive ? (
						<Button asChild size="lg">
							<Link href="/grn/receive">Receive goods</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				value=""
				onChange={() => {}}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<Select
					value={statusFilter}
					onValueChange={(value) =>
						onStatusFilterChange(value as "all" | GrnStatus)
					}
				>
					<SelectTrigger className="w-40" aria-label="Status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						{grnStatusValues.map((option) => (
							<SelectItem key={option} value={option}>
								{getStatusTone("grn", option).label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={qaStatusFilter}
					onValueChange={(value) =>
						onQaStatusFilterChange(value as "all" | GrnQaStatus)
					}
				>
					<SelectTrigger className="w-40" aria-label="QA status">
						<SelectValue placeholder="QA status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All QA statuses</SelectItem>
						{grnQaStatusValues.map((option) => (
							<SelectItem key={option} value={option}>
								{getStatusTone("grnQa", option).label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="relative w-48">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={qInput}
						onChange={(event) => onQChange(event.target.value)}
						placeholder="Search GRN number"
						aria-label="Search GRN number"
						className="pl-7"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Select
						value={sortBy}
						onValueChange={(value) => onSortByChange(value as GrnSortField)}
					>
						<SelectTrigger className="w-36" aria-label="Sort by">
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							{SORT_FIELDS.map((field) => (
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
				isLoading={grnQuery.isLoading}
				hidePagination
				emptyState={emptyState}
				errorState={
					grnQuery.isError ? (
						<ErrorState
							message={
								grnQuery.error instanceof Error
									? grnQuery.error.message
									: "The list could not be loaded."
							}
							onRetry={() => {
								void grnQuery.refetch();
							}}
							retrying={grnQuery.isRefetching}
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
