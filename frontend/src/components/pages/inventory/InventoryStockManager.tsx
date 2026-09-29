"use client";

import {
	type ColumnDef,
	getCoreRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import { InventoryBackButton } from "@/components/pages/inventory/InventoryBackButton";
import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useStockQuery } from "@/lib/api/asset/queries";
import {
	type AssetItemCategory,
	type AssetStockListParams,
	type AssetStockRow,
	assetItemCategoryValues,
} from "@/types/asset";

type StockSortField = NonNullable<AssetStockListParams["sortBy"]>;

const SORTABLE: StockSortField[] = [
	"sku",
	"name",
	"category",
	"currentStock",
	"valuePaise",
];

function isSortField(value: string): value is StockSortField {
	return (SORTABLE as string[]).includes(value);
}

export function InventoryStockManager() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([]);
	const [searchValue, setSearchValue] = useState("");
	const [category, setCategory] = useState<"all" | AssetItemCategory>("all");
	const [reorderFilter, setReorderFilter] = useState<"all" | "below">("all");

	const debouncedSearch = useDebouncedValue(searchValue, 350);
	const activeSort = sorting[0];

	const stockQuery = useStockQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		q: debouncedSearch || undefined,
		category: category === "all" ? undefined : category,
		belowReorder: reorderFilter === "below" ? true : undefined,
		sortBy:
			activeSort && isSortField(activeSort.id) ? activeSort.id : undefined,
		sortDir: activeSort ? (activeSort.desc ? "desc" : "asc") : undefined,
	});

	const rows = stockQuery.data?.data ?? [];
	const meta = stockQuery.data?.meta;

	const columns = useMemo<ColumnDef<AssetStockRow>[]>(
		() => [
			{
				id: "name",
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Item" />
				),
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<span>{row.original.name}</span>
						{row.original.isActive ? null : (
							<Badge variant="outline">Inactive</Badge>
						)}
					</div>
				),
			},
			{
				id: "sku",
				accessorKey: "sku",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="SKU" />
				),
			},
			{
				id: "category",
				accessorKey: "category",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Category" />
				),
			},
			{
				id: "currentStock",
				accessorKey: "currentStock",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Stock" />
				),
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<span>
							{row.original.currentStock} {row.original.uom}
						</span>
						{row.original.belowReorder ? (
							<Badge variant="destructive">Below reorder</Badge>
						) : null}
					</div>
				),
			},
			{
				id: "averageCostPaise",
				accessorKey: "averageCostPaise",
				enableSorting: false,
				header: "Average cost",
				cell: ({ getValue }) => formatPaise(getValue<number>()),
			},
			{
				id: "valuePaise",
				accessorKey: "valuePaise",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Value" />
				),
				cell: ({ getValue }) => formatPaise(getValue<number>()),
			},
			{
				id: "reorderLevel",
				accessorKey: "reorderLevel",
				enableSorting: false,
				header: "Reorder level",
			},
			{
				id: "locations",
				enableSorting: false,
				header: "By location",
				cell: ({ row }) =>
					row.original.locations.length === 0 ? (
						"—"
					) : (
						<ul className="text-xs">
							{row.original.locations.map((location) => (
								<li key={location.locationId}>
									{location.locationName}: {location.balance} {row.original.uom}
								</li>
							))}
						</ul>
					),
			},
		],
		[],
	);

	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		manualSorting: true,
		pageCount: meta?.totalPages ?? 1,
		onPaginationChange: setPagination,
		onSortingChange: (updater) => {
			setSorting(updater);
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		state: { pagination, sorting },
	});

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<InventoryBackButton />
			<h1 className="text-2xl font-semibold">Stock</h1>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div className="flex w-full flex-col gap-1.5 sm:max-w-sm">
					<Label htmlFor="stock-search">Search</Label>
					<Input
						id="stock-search"
						value={searchValue}
						placeholder="SKU or item name"
						onChange={(event) => {
							setSearchValue(event.target.value);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
					/>
				</div>

				<div className="flex w-full flex-col gap-1.5 sm:w-48">
					<Label htmlFor="stock-category">Category</Label>
					<Select
						value={category}
						onValueChange={(value) => {
							setCategory(value as "all" | AssetItemCategory);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
					>
						<SelectTrigger id="stock-category" className="w-full">
							<SelectValue placeholder="Category" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All categories</SelectItem>
							{assetItemCategoryValues.map((entry) => (
								<SelectItem key={entry} value={entry}>
									{entry}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex w-full flex-col gap-1.5 sm:w-48">
					<Label htmlFor="stock-reorder">Reorder</Label>
					<Select
						value={reorderFilter}
						onValueChange={(value) => {
							setReorderFilter(value as "all" | "below");
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
					>
						<SelectTrigger id="stock-reorder" className="w-full">
							<SelectValue placeholder="Reorder" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All items</SelectItem>
							<SelectItem value="below">Below reorder level</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<DataTable table={table} isLoading={stockQuery.isLoading} />
		</div>
	);
}
