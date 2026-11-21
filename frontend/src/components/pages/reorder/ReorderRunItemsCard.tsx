"use client";

import { useTable } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { qtyText } from "@/components/pages/reorder/reorder-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReorderRunItem } from "@/types/reorder";

const columns: DataTableColumnDef<ReorderRunItem>[] = [
	{
		accessorKey: "sku",
		header: "SKU",
		cell: ({ row }) => <span className="font-mono">{row.original.sku}</span>,
	},
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "uom", header: "Unit" },
	{
		accessorKey: "usableQty",
		header: "Usable",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.usableQty),
	},
	{
		accessorKey: "onTheWayQty",
		header: "On the way",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.onTheWayQty),
	},
	{
		accessorKey: "projectedQty",
		header: "Projected",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.projectedQty),
	},
	{
		accessorKey: "reorderLevel",
		header: "Level",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.reorderLevel),
	},
	{
		accessorKey: "orderQty",
		header: "Order qty",
		meta: { numeric: true },
		cell: ({ row }) => qtyText(row.original.orderQty),
	},
	{
		accessorKey: "outcome",
		header: "Result",
		cell: ({ row }) => (
			<StatusBadge doc="reorderOutcome" status={row.original.outcome} />
		),
	},
];

/** Items the run looked at; not paged (BR-RO-22). */
export function ReorderRunItemsCard({ items }: { items: ReorderRunItem[] }) {
	const data = useMemo(() => items, [items]);
	const table = useTable({
		features: dataTableFeatures,
		data,
		columns,
		manualPagination: true,
		manualSorting: true,
	});
	return (
		<Card>
			<CardHeader>
				<CardTitle>Items</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nothing to order</p>
				) : (
					<DataTable table={table} hidePagination />
				)}
			</CardContent>
		</Card>
	);
}
