"use client";

import {
	IconFileOff,
	IconPlus,
	IconSearch,
	IconSettings,
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
import {
	SCO_STATUS_FILTER_OPTIONS,
	useScoControls,
} from "@/components/views/subcontracting/use-sco-controls";
import { useCan } from "@/hooks/use-can";
import { useScosQuery } from "@/lib/api/subcontracting/queries";
import { formatDate, formatDocNo, formatMoney } from "@/lib/format";
import type { Sco, ScoSortField, ScoStatus } from "@/types/subcontracting";

const SORT_FIELDS: Array<{ label: string; value: ScoSortField }> = [
	{ label: "Created", value: "createdAt" },
	{ label: "SCO number", value: "scoNumber" },
	{ label: "Status", value: "status" },
	{ label: "Return date", value: "expectedReturnDate" },
];

const columns: DataTableColumnDef<Sco>[] = [
	{
		accessorKey: "scoNumber",
		header: "SCO no.",
		cell: ({ row }) => (
			<Link
				href={`/subcontracting/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{formatDocNo(row.original.scoNumber)}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="sco" status={row.original.status} />,
	},
	{ accessorKey: "vendorName", header: "Vendor" },
	{
		accessorKey: "expectedReturnDate",
		header: "Return by",
		cell: ({ row }) => formatDate(row.original.expectedReturnDate),
	},
	{
		accessorKey: "totalAmountPaise",
		header: "Total incl. GST",
		meta: { numeric: true },
		cell: ({ row }) => formatMoney(row.original.totalAmountPaise),
	},
];

export function SubcontractingView() {
	const canManage = useCan("sco.manage");
	const canEditCompany = useCan("company.manage");
	const controls = useScoControls();

	const scoQuery = useScosQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		sortBy: controls.sortBy,
		sortDir: controls.sortDir,
		status: controls.status,
		q: controls.q,
	});

	const orders = useMemo(() => scoQuery.data?.data ?? [], [scoQuery.data]);
	const table = useTable({
		features: dataTableFeatures,
		data: orders,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const filtersActive =
		controls.statusFilter !== "all" || controls.qInput !== "";
	const resetFilters = () => {
		controls.onStatusFilterChange("all");
		controls.onQChange("");
	};

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Subcontracting orders"
				description="Send raw material to a vendor for job work and track it back."
				actions={
					<>
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href="/subcontracting/challans">Open challans</Link>
						</Button>
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href="/subcontracting/reports">Reports</Link>
						</Button>
						{canEditCompany ? (
							<Button type="button" size="sm" variant="outline" asChild>
								<Link href="/subcontracting/settings">
									<IconSettings />
									Company details
								</Link>
							</Button>
						) : null}
						{canManage ? (
							<Button type="button" size="sm" asChild>
								<Link href="/subcontracting/new">
									<IconPlus />
									New SCO
								</Link>
							</Button>
						) : null}
					</>
				}
			/>

			<FilterBar
				value={controls.statusFilter}
				onChange={() => {}}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<Select
					value={controls.statusFilter}
					onValueChange={(value) =>
						controls.onStatusFilterChange(value as "all" | ScoStatus)
					}
				>
					<SelectTrigger className="w-52" aria-label="Status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						{SCO_STATUS_FILTER_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="relative w-64">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.qInput}
						onChange={(event) => controls.onQChange(event.target.value)}
						placeholder="Search SCO number or vendor"
						aria-label="Search SCO number or vendor"
						className="pl-7"
					/>
				</div>

				<Select
					value={controls.sortBy}
					onValueChange={(value) =>
						controls.onSortByChange(value as ScoSortField)
					}
				>
					<SelectTrigger className="w-40" aria-label="Sort by">
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

				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Asc</span>
					<Switch
						checked={controls.sortDir === "desc"}
						onCheckedChange={controls.onSortDirectionChange}
						aria-label="Toggle sort direction"
					/>
					<span>Dsc</span>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={scoQuery.isLoading}
				hidePagination
				emptyState={
					filtersActive ? (
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
							title="No subcontracting orders yet"
							action={
								canManage ? (
									<Button type="button" size="sm" asChild>
										<Link href="/subcontracting/new">New SCO</Link>
									</Button>
								) : undefined
							}
						/>
					)
				}
				errorState={
					scoQuery.isError ? (
						<ErrorState
							message={
								scoQuery.error instanceof Error
									? scoQuery.error.message
									: "The list could not be loaded."
							}
							onRetry={() => {
								void scoQuery.refetch();
							}}
							retrying={scoQuery.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={controls.page}
				pageSize={controls.pageSize}
				total={scoQuery.data?.meta.total ?? 0}
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>
		</div>
	);
}
