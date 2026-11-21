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
import { NoAccessState } from "@/components/shared/NoAccessState";
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
	PRT_TABS,
	useReturnControls,
} from "@/components/views/purchase-returns/use-return-controls";
import { useCan } from "@/hooks/use-can";
import {
	prtErrorMessage,
	useAwaitingReturnsQuery,
	usePurchaseReturnsQuery,
} from "@/lib/api/purchase-return/queries";
import { useSuppliersQuery } from "@/lib/api/suppliers/queries";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import type { PrtAwaitingRow, PrtListRow } from "@/types/purchase-return";

const returnColumns: DataTableColumnDef<PrtListRow>[] = [
	{
		accessorKey: "proNumber",
		header: "Return no.",
		cell: ({ row }) => (
			<Link
				href={`/purchase-returns/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.proNumber}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<StatusBadge doc="purchaseReturn" status={row.original.status} />
		),
	},
	{
		accessorKey: "supplierName",
		header: "Supplier",
		// Below 1100 px the GRN / PO columns are hidden; their numbers sit under the supplier.
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span>{row.original.supplierName}</span>
				<span className="font-mono text-[13px] text-muted-foreground min-[1100px]:hidden">
					{row.original.grnNumber} · {row.original.poNumber}
				</span>
			</div>
		),
	},
	{
		accessorKey: "grnNumber",
		header: "GRN no.",
		meta: { hideBelow1100: true },
		cell: ({ row }) => (
			<span className="font-mono">{row.original.grnNumber}</span>
		),
	},
	{
		accessorKey: "poNumber",
		header: "PO no.",
		meta: { hideBelow1100: true },
		cell: ({ row }) => (
			<span className="font-mono">{row.original.poNumber}</span>
		),
	},
	{
		accessorKey: "linesCount",
		header: "Lines",
		meta: { numeric: true, hideBelow1100: true },
	},
	{
		accessorKey: "totalPaise",
		header: "Debit note total",
		meta: { numeric: true },
		cell: ({ row }) => formatMoney(row.original.totalPaise),
	},
	{
		accessorKey: "createdAt",
		header: "Date",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

function awaitingColumns(
	canReturn: boolean,
): DataTableColumnDef<PrtAwaitingRow>[] {
	const columns: DataTableColumnDef<PrtAwaitingRow>[] = [
		{
			accessorKey: "grnNumber",
			header: "GRN no.",
			cell: ({ row }) => (
				<Link
					href={`/grn/${row.original.grnId}`}
					className="font-mono text-brand-accent hover:underline"
				>
					{row.original.grnNumber}
				</Link>
			),
		},
		{ accessorKey: "supplierName", header: "Supplier" },
		{ accessorKey: "itemName", header: "Item" },
		{
			accessorKey: "batchNumber",
			header: "Heat no.",
			cell: ({ row }) => row.original.batchNumber ?? "–",
		},
		{
			accessorKey: "rejectedQty",
			header: "Rejected qty",
			meta: { numeric: true },
			cell: ({ row }) =>
				formatQty(row.original.rejectedQty, row.original.uom, 3),
		},
		{
			accessorKey: "awaitingQty",
			header: "Open to return",
			meta: { numeric: true },
			cell: ({ row }) =>
				formatQty(row.original.awaitingQty, row.original.uom, 3),
		},
	];
	if (canReturn) {
		columns.push({
			id: "action",
			header: () => <span className="sr-only">Action</span>,
			cell: ({ row }) => (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href={`/purchase-returns/new?grnId=${row.original.grnId}`}>
						Return to supplier
					</Link>
				</Button>
			),
		});
	}
	return columns;
}

export function PurchaseReturnListView() {
	const canView = useCan("purchase_return.view");
	const canEdit = useCan("purchase_return.edit_draft");
	const canViewGrn = useCan("grn.view");
	const controls = useReturnControls();

	const returnsQuery = usePurchaseReturnsQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			sortBy: "id",
			sortDir: "desc",
			status: controls.statusParam,
			supplierId: controls.supplierId ?? undefined,
			dateFrom: controls.dateFrom ?? undefined,
			dateTo: controls.dateTo ?? undefined,
			q: controls.q,
		},
		canView && !controls.awaiting && controls.rangeOk,
	);
	const awaitingQuery = useAwaitingReturnsQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			sortBy: "grnId",
			sortDir: "asc",
			supplierId: controls.supplierId ?? undefined,
		},
		canView && controls.awaiting,
	);
	const suppliers = useSuppliersQuery({
		page: 1,
		pageSize: 100,
		sortBy: "name",
		sortDir: "asc",
	});

	const returnRows = useMemo(
		() => returnsQuery.data?.data ?? [],
		[returnsQuery.data],
	);
	const awaitingRows = useMemo(
		() => awaitingQuery.data?.data ?? [],
		[awaitingQuery.data],
	);
	const columnsForAwaiting = useMemo(() => awaitingColumns(canEdit), [canEdit]);

	const returnsTable = useTable({
		features: dataTableFeatures,
		data: returnRows,
		columns: returnColumns,
		manualPagination: true,
		manualSorting: true,
	});
	const awaitingTable = useTable({
		features: dataTableFeatures,
		data: awaitingRows,
		columns: columnsForAwaiting,
		manualPagination: true,
		manualSorting: true,
	});

	if (!canView) {
		return <NoAccessState what="purchase returns" />;
	}

	const meta = (controls.awaiting ? awaitingQuery : returnsQuery).data?.meta;
	const counts = meta?.statusCounts;
	const quickCount: Record<string, number | undefined> = {
		all: counts ? counts.draft + counts.posted + counts.cancelled : undefined,
		draft: counts?.draft,
		posted: counts?.posted,
		cancelled: counts?.cancelled,
		awaiting: meta?.awaitingCount,
	};

	const activeQuery = controls.awaiting ? awaitingQuery : returnsQuery;
	const total = activeQuery.data?.meta.total ?? 0;

	const resetButton = (
		<Button type="button" variant="outline" size="sm" onClick={controls.reset}>
			Reset filters
		</Button>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Purchase returns"
				description="Goods sent back to suppliers, and what still waits to go back."
			/>

			<FilterBar
				quick={PRT_TABS.map((entry) => ({
					...entry,
					count: quickCount[entry.key],
				}))}
				value={controls.tab}
				onChange={controls.onTabChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<Select
					value={
						controls.supplierId === null ? "all" : String(controls.supplierId)
					}
					onValueChange={(value) =>
						controls.onSupplierChange(value === "all" ? null : Number(value))
					}
				>
					<SelectTrigger className="w-36" aria-label="Supplier">
						<SelectValue placeholder="Supplier" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All suppliers</SelectItem>
						{(suppliers.data?.data ?? []).map((supplier) => (
							<SelectItem key={supplier.id} value={String(supplier.id)}>
								{supplier.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{controls.awaiting ? null : (
					<>
						<Input
							type="date"
							value={controls.dateFrom ?? ""}
							max={controls.dateTo ?? undefined}
							onChange={(event) =>
								controls.onDateFromChange(event.target.value)
							}
							aria-label="Date from"
							className="w-32"
						/>
						<Input
							type="date"
							value={controls.dateTo ?? ""}
							min={controls.dateFrom ?? undefined}
							onChange={(event) => controls.onDateToChange(event.target.value)}
							aria-label="Date to"
							className="w-32"
						/>
						<div className="relative w-36">
							<IconSearch
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								value={controls.searchInput}
								onChange={(event) =>
									controls.onSearchChange(event.target.value)
								}
								placeholder="Search return no."
								aria-label="Search return no."
								className="pl-7"
							/>
						</div>
					</>
				)}
			</FilterBar>

			{controls.awaiting ? (
				<DataTable
					table={awaitingTable}
					isLoading={awaitingQuery.isLoading}
					hidePagination
					emptyState={
						controls.filtersActive ? (
							<EmptyState
								icon={IconFileOff}
								title="Nothing matches these filters"
								action={resetButton}
							/>
						) : (
							<EmptyState
								icon={IconFileOff}
								title="Nothing waits to go back."
							/>
						)
					}
					errorState={
						awaitingQuery.isError ? (
							<ErrorState
								message={prtErrorMessage(
									awaitingQuery.error,
									"The list could not be loaded.",
								)}
								onRetry={() => {
									void awaitingQuery.refetch();
								}}
								retrying={awaitingQuery.isRefetching}
							/>
						) : undefined
					}
				/>
			) : (
				<DataTable
					table={returnsTable}
					isLoading={returnsQuery.isLoading}
					hidePagination
					emptyState={
						controls.filtersActive || controls.tab !== "all" ? (
							<EmptyState
								icon={IconFileOff}
								title="Nothing matches these filters"
								action={resetButton}
							/>
						) : (
							<EmptyState
								icon={IconFileOff}
								title="No returns yet. Returns start from a GRN."
								action={
									canViewGrn ? (
										<Button type="button" size="sm" asChild>
											<Link href="/grn">Go to GRNs</Link>
										</Button>
									) : undefined
								}
							/>
						)
					}
					errorState={
						returnsQuery.isError ? (
							<ErrorState
								message={prtErrorMessage(
									returnsQuery.error,
									"The list could not be loaded.",
								)}
								onRetry={() => {
									void returnsQuery.refetch();
								}}
								retrying={returnsQuery.isRefetching}
							/>
						) : undefined
					}
				/>
			)}

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
