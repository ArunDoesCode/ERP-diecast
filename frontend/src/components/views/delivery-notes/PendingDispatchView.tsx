"use client";

import { IconPackageExport } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { SoNumberLink } from "@/components/pages/delivery-notes/DnSidePanels";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { usePendingControls } from "@/components/views/delivery-notes/use-pending-controls";
import { useCan } from "@/hooks/use-can";
import {
	dnErrorMessage,
	usePendingDispatchQuery,
} from "@/lib/api/delivery-note/queries";
import { formatDate, formatQty } from "@/lib/format";
import { type DnPendingRow, dnQtyDecimals } from "@/types/delivery-note";

function columns(
	canViewSo: boolean,
	canManage: boolean,
): DataTableColumnDef<DnPendingRow>[] {
	const qty = (value: number, row: DnPendingRow) =>
		formatQty(value, row.uom, dnQtyDecimals(row.uom));
	const out: DataTableColumnDef<DnPendingRow>[] = [
		{
			accessorKey: "soNumber",
			header: "SO no.",
			cell: ({ row }) => (
				<SoNumberLink
					soId={row.original.soId}
					soNumber={row.original.soNumber}
					canView={canViewSo}
				/>
			),
		},
		{
			id: "customer",
			header: "Customer",
			cell: ({ row }) => row.original.customer.name,
		},
		{
			id: "item",
			header: "Item",
			cell: ({ row }) => (
				<div className="flex flex-col">
					<span className="font-mono">{row.original.item.sku}</span>
					<span className="text-[13px] text-muted-foreground">
						{row.original.item.name}
					</span>
				</div>
			),
		},
		{
			accessorKey: "ordered",
			header: "Ordered",
			meta: { numeric: true, hideBelow1100: true },
			cell: ({ row }) => qty(row.original.ordered, row.original),
		},
		{
			accessorKey: "delivered",
			header: "Delivered",
			meta: { numeric: true, hideBelow1100: true },
			cell: ({ row }) => qty(row.original.delivered, row.original),
		},
		{
			accessorKey: "open",
			header: "Open",
			meta: { numeric: true },
			// Below 1100 px the ordered / delivered columns are hidden; their numbers sit under Open.
			cell: ({ row }) => (
				<div className="flex flex-col items-end">
					<span className="font-semibold">
						{qty(row.original.open, row.original)}
					</span>
					<span className="text-[13px] text-muted-foreground min-[1100px]:hidden">
						{formatQty(
							row.original.delivered,
							null,
							dnQtyDecimals(row.original.uom),
						)}{" "}
						of{" "}
						{formatQty(
							row.original.ordered,
							null,
							dnQtyDecimals(row.original.uom),
						)}{" "}
						sent
					</span>
				</div>
			),
		},
		{
			accessorKey: "soDate",
			header: "SO date",
			meta: { hideBelow1100: true },
			cell: ({ row }) => formatDate(row.original.soDate),
		},
		{
			accessorKey: "stockAtLocation",
			header: "Stock",
			meta: { numeric: true },
			cell: ({ row }) => (
				<div className="flex flex-col items-end gap-1">
					<span>{qty(row.original.stockAtLocation, row.original)}</span>
					{row.original.stockAtLocation < row.original.open ? (
						<StatusBadge doc="dnTag" status="short_stock" />
					) : null}
				</div>
			),
		},
	];
	if (canManage) {
		out.push({
			id: "action",
			header: () => <span className="sr-only">Action</span>,
			cell: ({ row }) => (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link
						href={`/delivery-notes/new?so=${row.original.soId}&line=${row.original.soLineId}`}
					>
						Dispatch
					</Link>
				</Button>
			),
		});
	}
	return out;
}

export function PendingDispatchView() {
	const canView = useCan("dispatch.view");
	const canManage = useCan("dispatch.manage");
	const canViewSo = useCan("so.view");
	const controls = usePendingControls();

	const query = usePendingDispatchQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			sortBy: "soDate",
			sortDir: "asc",
			customerId: controls.customerId ?? undefined,
			itemId: controls.itemId ?? undefined,
		},
		canView,
	);
	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const cols = useMemo(
		() => columns(canViewSo, canManage),
		[canViewSo, canManage],
	);
	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns: cols,
		manualPagination: true,
		manualSorting: true,
	});

	if (!canView) return <NoAccessState what="pending dispatch" />;

	const meta = query.data?.meta;
	const total = meta?.total ?? 0;
	const resetButton = (
		<Button type="button" variant="outline" size="sm" onClick={controls.reset}>
			Reset filters
		</Button>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Pending dispatch"
				description="Open sale order lines waiting to ship, with the stock on hand to ship them."
			/>

			<FilterBar
				value=""
				onChange={() => undefined}
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
					<SelectTrigger className="w-44" aria-label="Customer">
						<SelectValue placeholder="Customer" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All customers</SelectItem>
						{(meta?.customers ?? []).map((customer) => (
							<SelectItem key={customer.id} value={String(customer.id)}>
								{customer.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={controls.itemId === null ? "all" : String(controls.itemId)}
					onValueChange={(value) =>
						controls.onItemChange(value === "all" ? null : Number(value))
					}
				>
					<SelectTrigger className="w-44" aria-label="Item">
						<SelectValue placeholder="Item" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All items</SelectItem>
						{(meta?.items ?? []).map((item) => (
							<SelectItem key={item.id} value={String(item.id)}>
								{item.sku} · {item.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					controls.filtersActive ? (
						<EmptyState
							icon={IconPackageExport}
							title="Nothing matches these filters"
							action={resetButton}
						/>
					) : (
						<EmptyState
							icon={IconPackageExport}
							title="Nothing waiting to ship."
							action={
								<Button type="button" size="sm" variant="outline" asChild>
									<Link href="/delivery-notes">Delivery notes</Link>
								</Button>
							}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={dnErrorMessage(
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
