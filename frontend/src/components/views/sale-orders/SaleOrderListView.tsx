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
import {
	SO_STATUS_QUICK,
	useSoControls,
} from "@/components/views/sale-orders/use-so-controls";
import { useCan } from "@/hooks/use-can";
import { useCustomersQuery } from "@/lib/api/customers/queries";
import {
	soErrorMessage,
	useSaleOrdersQuery,
} from "@/lib/api/sale-order/queries";
import { formatDate, formatMoney } from "@/lib/format";
import type { SoListRow, SoStatusCounts } from "@/types/sale-order";

const columns: DataTableColumnDef<SoListRow>[] = [
	{
		accessorKey: "soNumber",
		header: "SO no.",
		cell: ({ row }) => (
			<Link
				href={`/sale-orders/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.soNumber}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="so" status={row.original.status} />,
	},
	{ accessorKey: "customerName", header: "Customer" },
	{
		accessorKey: "customerPoNumber",
		header: "Customer PO",
		cell: ({ row }) => row.original.customerPoNumber ?? "–",
	},
	{
		accessorKey: "orderDate",
		header: "Ordered",
		cell: ({ row }) => formatDate(row.original.orderDate),
	},
	{
		accessorKey: "nextDeliveryDate",
		header: "Next delivery",
		cell: ({ row }) => formatDate(row.original.nextDeliveryDate),
	},
	{
		accessorKey: "totalAmountPaise",
		header: "Value",
		meta: { numeric: true },
		cell: ({ row }) => formatMoney(row.original.totalAmountPaise),
	},
	{
		id: "explosion",
		header: "Explosion",
		cell: ({ row }) =>
			row.original.snapshotStatus === "none" ? (
				"–"
			) : (
				<StatusBadge doc="soSnapshot" status={row.original.snapshotStatus} />
			),
	},
];

function quickCounts(counts: SoStatusCounts | undefined) {
	if (!counts) return {} as Record<string, number | undefined>;
	const all =
		counts.draft +
		counts.confirmed +
		counts.on_hold +
		counts.closed +
		counts.cancelled;
	return {
		open: counts.draft + counts.confirmed + counts.on_hold,
		draft: counts.draft,
		confirmed: counts.confirmed,
		on_hold: counts.on_hold,
		closed: counts.closed,
		cancelled: counts.cancelled,
		all: all,
	} as Record<string, number | undefined>;
}

export function SaleOrderListView() {
	const canManage = useCan("so.manage");
	const controls = useSoControls();
	const query = useSaleOrdersQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		sortBy: "createdAt",
		sortDir: "desc",
		status: controls.statusParam,
		customerId: controls.customerId ?? undefined,
		q: controls.q,
	});
	const customers = useCustomersQuery({
		page: 1,
		pageSize: 100,
		sortBy: "name",
		sortDir: "asc",
	});

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const counts = quickCounts(query.data?.meta.statusCounts);
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
				title="Sale orders"
				description="Customer orders and what each one needs next."
				actions={
					canManage ? (
						<Button type="button" size="sm" asChild>
							<Link href="/sale-orders/new">
								<IconPlus />
								New sale order
							</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				quick={SO_STATUS_QUICK.map((entry) => ({
					...entry,
					count: counts[entry.key],
				}))}
				value={controls.status}
				onChange={controls.onStatusChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<Select
					value={
						controls.customerId === null ? "all" : String(controls.customerId)
					}
					onValueChange={(value) =>
						controls.onCustomerChange(value === "all" ? null : Number(value))
					}
				>
					<SelectTrigger className="w-40" aria-label="Customer">
						<SelectValue placeholder="Customer" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All customers</SelectItem>
						{(customers.data?.data ?? []).map((customer) => (
							<SelectItem key={customer.id} value={String(customer.id)}>
								{customer.name}
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
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						placeholder="Search SO or customer PO"
						aria-label="Search SO no. or customer PO"
						className="pl-7"
					/>
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
							title="No sale orders yet"
							action={
								canManage ? (
									<Button type="button" size="sm" asChild>
										<Link href="/sale-orders/new">New sale order</Link>
									</Button>
								) : undefined
							}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={soErrorMessage(
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
		</div>
	);
}
