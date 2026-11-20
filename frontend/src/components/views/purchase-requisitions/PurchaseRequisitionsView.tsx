"use client";

import { IconFileOff, IconPlus, IconSearch } from "@tabler/icons-react";
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
import { usePRListControls } from "@/components/views/purchase-requisitions/use-pr-list-controls";
import { useCan } from "@/hooks/use-can";
import { usePurchaseRequisitionsQuery } from "@/lib/api/purchase-requisitions/queries";
import { formatDate, formatDocNo, formatMoney } from "@/lib/format";
import { getStatusTone } from "@/lib/status-tone";
import {
	type PRStatus,
	type PRType,
	type PurchaseRequisition,
	prStatusValues,
	prTypeValues,
} from "@/types/purchase-requisitions";

export function PurchaseRequisitionsView() {
	const {
		filtersActive,
		onPageSizeChange,
		onSearchChange,
		onSortDirectionChange,
		onStatusFilterChange,
		onTypeFilterChange,
		page,
		pageSize,
		q,
		resetFilters,
		search,
		setPage,
		sortDir,
		status,
		statusFilter,
		type,
		typeFilter,
	} = usePRListControls();

	const canManage = useCan("pr.manage");

	const requisitionsQuery = usePurchaseRequisitionsQuery({
		page,
		pageSize,
		q,
		status,
		type,
		sortBy: "createdAt",
		sortDir,
	});

	const requisitions = useMemo(
		() => requisitionsQuery.data?.data ?? [],
		[requisitionsQuery.data],
	);
	const total = requisitionsQuery.data?.meta.total ?? 0;

	const columns = useMemo<DataTableColumnDef<PurchaseRequisition>[]>(
		() => [
			{
				accessorKey: "prNumber",
				header: "PR no.",
				cell: ({ row }) => (
					<Link
						href={`/purchase-requisitions/${row.original.id}/edit`}
						className="cursor-pointer font-mono text-brand-accent hover:underline"
					>
						{formatDocNo(row.original.prNumber)}
					</Link>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => (
					<StatusBadge doc="pr" status={row.original.status} />
				),
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
		],
		[],
	);

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
			title="No purchase requisitions yet"
			action={
				canManage ? (
					<Button size="sm" asChild>
						<Link href="/purchase-requisitions/new">
							<IconPlus />
							New requisition
						</Link>
					</Button>
				) : undefined
			}
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Purchase requisitions"
				description="Ask for items to be bought, and follow each request to its order."
				actions={
					canManage ? (
						<Button size="sm" asChild>
							<Link href="/purchase-requisitions/new">
								<IconPlus />
								New requisition
							</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				value="all"
				onChange={() => {}}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<div className="relative w-52">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Search PR number or notes"
						aria-label="Search PR number or notes"
						className="pl-7"
					/>
				</div>

				<Select
					value={statusFilter}
					onValueChange={(value) =>
						onStatusFilterChange(value as "all" | PRStatus)
					}
				>
					<SelectTrigger className="w-44" aria-label="Status">
						<SelectValue placeholder="Select status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						{prStatusValues.map((value) => (
							<SelectItem key={value} value={value}>
								{getStatusTone("pr", value).label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={typeFilter}
					onValueChange={(value) => onTypeFilterChange(value as "all" | PRType)}
				>
					<SelectTrigger className="w-40" aria-label="Type">
						<SelectValue placeholder="Select type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All types</SelectItem>
						{prTypeValues.map((value) => (
							<SelectItem key={value} value={value}>
								{value}
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
			</FilterBar>

			<DataTable
				table={table}
				isLoading={requisitionsQuery.isLoading}
				hidePagination
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
