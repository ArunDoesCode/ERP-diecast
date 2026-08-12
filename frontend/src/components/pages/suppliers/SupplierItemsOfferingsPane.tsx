"use client";

import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSupplierItemsQuery } from "@/lib/api/suppliers/queries";
import type { SupplierItem } from "@/types/suppliers";

function toCurrencyFromPaise(value: number) {
	return (value / 100).toLocaleString(undefined, {
		style: "currency",
		currency: "INR",
	});
}

export function SupplierItemsOfferingsPane({
	supplierId,
	active,
	search,
	page,
	pageSize,
	onPageChange,
	onEdit,
}: {
	supplierId: number;
	active: boolean;
	search: string;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onEdit: (item: SupplierItem) => void;
}) {
	const itemQuery = useSupplierItemsQuery(
		supplierId,
		{
			page,
			pageSize,
			q: search || undefined,
		},
		active,
	);

	const itemRows = itemQuery.data?.data ?? [];
	const itemMeta = itemQuery.data?.meta;

	const columns = useMemo<ColumnDef<SupplierItem>[]>(
		() => [
			{
				accessorKey: "itemName",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Item" />
				),
				cell: ({ row }) => (
					<Button
						type="button"
						variant="link"
						className="h-auto p-0"
						onClick={() => onEdit(row.original)}
					>
						{row.original.itemName}
					</Button>
				),
			},
			{
				accessorKey: "supplierSku",
				header: "Supplier SKU",
				cell: ({ row }) => row.original.supplierSku || "N/A",
			},
			{
				accessorKey: "supplierUnitPricePaise",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Unit price" />
				),
				cell: ({ row }) =>
					toCurrencyFromPaise(row.original.supplierUnitPricePaise),
			},
			{
				accessorKey: "taxPercentage",
				header: "Tax %",
				cell: ({ row }) => row.original.taxPercentage ?? "N/A",
			},
			{
				accessorKey: "leadTimeDays",
				header: "Lead days",
				cell: ({ row }) => row.original.leadTimeDays ?? "N/A",
			},
			{
				accessorKey: "qty",
				header: "Qty",
				cell: ({ row }) => row.original.qty ?? "N/A",
			},
			{
				accessorKey: "uom",
				header: "UOM",
			},
			{
				accessorKey: "isActive",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={row.original.isActive ? "default" : "outline"}>
						{row.original.isActive ? "Active" : "Inactive"}
					</Badge>
				),
			},
		],
		[onEdit],
	);

	const pagination = useMemo<PaginationState>(
		() => ({
			pageIndex: (itemMeta?.page ?? page) - 1,
			pageSize: itemMeta?.pageSize ?? pageSize,
		}),
		[itemMeta?.page, itemMeta?.pageSize, page, pageSize],
	);

	const table = useReactTable({
		data: itemRows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		pageCount: itemMeta?.totalPages ?? 1,
		onPaginationChange: (updater) => {
			const current = {
				pageIndex: pagination.pageIndex,
				pageSize: pagination.pageSize,
			};
			const next = typeof updater === "function" ? updater(current) : updater;
			if (next.pageIndex !== current.pageIndex) {
				onPageChange(next.pageIndex + 1);
			}
		},
		state: { pagination },
	});

	if (itemQuery.isError) {
		return (
			<div className="rounded-md border p-4">
				<p className="text-sm text-destructive">
					Failed to load supplier item offerings.
				</p>
				<Button
					type="button"
					variant="outline"
					className="mt-3"
					onClick={() => itemQuery.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	}

	return <DataTable table={table} isLoading={itemQuery.isLoading} />;
}
