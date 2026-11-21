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
	SINV_TABS,
	useInvoiceControls,
} from "@/components/views/supplier-invoices/use-invoice-controls";
import { useCan } from "@/hooks/use-can";
import {
	sinvErrorMessage,
	useSupplierInvoicesQuery,
} from "@/lib/api/supplier-invoice/queries";
import { formatDate, formatMoney } from "@/lib/format";
import type { SinvListRow } from "@/types/supplier-invoice";

const columns: DataTableColumnDef<SinvListRow>[] = [
	{
		accessorKey: "ourNumber",
		header: "Our no.",
		cell: ({ row }) => (
			<Link
				href={`/supplier-invoices/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.ourNumber}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span className="flex flex-wrap gap-1">
				<StatusBadge doc="supplierInvoice" status={row.original.status} />
				{row.original.overdue ? (
					<StatusBadge doc="supplierInvoice" status="overdue" />
				) : null}
			</span>
		),
	},
	{
		accessorKey: "invoiceNumber",
		header: "Supplier inv. no.",
		cell: ({ row }) => (
			<span className="font-mono">{row.original.invoiceNumber}</span>
		),
	},
	{
		id: "supplier",
		header: "Supplier",
		cell: ({ row }) => row.original.supplier.name,
	},
	{
		accessorKey: "poNumber",
		header: "PO no.",
		cell: ({ row }) => (
			<span className="font-mono">{row.original.poNumber}</span>
		),
	},
	{
		accessorKey: "invoiceDate",
		header: "Invoice date",
		cell: ({ row }) => formatDate(row.original.invoiceDate),
	},
	{
		accessorKey: "dueDate",
		header: "Due date",
		cell: ({ row }) => formatDate(row.original.dueDate),
	},
	{
		accessorKey: "totalPaise",
		header: "Bill total",
		meta: { numeric: true },
		cell: ({ row }) => formatMoney(row.original.totalPaise),
	},
];

export function SupplierInvoiceListView() {
	const canView = useCan("invoice.view");
	const canManage = useCan("invoice.manage");
	const controls = useInvoiceControls();

	const query = useSupplierInvoicesQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			sortBy: "createdAt",
			sortDir: "desc",
			status: controls.tab,
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
		return <EmptyState title="You can't view supplier invoices" />;
	}

	const counts = query.data?.meta.statusCounts;
	const quickCount: Record<string, number | undefined> = {
		all: counts
			? counts.draft + counts.blocked + counts.payable + counts.cancelled
			: undefined,
		draft: counts?.draft,
		blocked: counts?.blocked,
		payable: counts?.payable,
		overdue: counts?.overdue,
		cancelled: counts?.cancelled,
	};
	const total = query.data?.meta.total ?? 0;
	const enterButton = canManage ? (
		<Button type="button" asChild>
			<Link href="/supplier-invoices/new">Enter supplier invoice</Link>
		</Button>
	) : undefined;

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Supplier invoices"
				description="Bills from suppliers, what is blocked, payable or overdue."
				actions={enterButton}
			/>

			<FilterBar
				quick={SINV_TABS.map((entry) => ({
					...entry,
					count: quickCount[entry.key],
				}))}
				value={controls.tab}
				onChange={controls.onTabChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<div className="relative w-64">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						maxLength={100}
						placeholder="Search number, supplier, PO"
						aria-label="Search invoices"
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
							title="No supplier invoices yet"
							action={enterButton}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={sinvErrorMessage(
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
