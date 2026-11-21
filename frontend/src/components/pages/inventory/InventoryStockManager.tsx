"use client";

import {
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import {
	listEmptyState,
	listErrorState,
} from "@/components/pages/inventory/list-states";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/hooks/use-can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useStockQuery } from "@/lib/api/asset/queries";
import { formatMoney } from "@/lib/format";
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

	const canTransfer = useCan("stock_transfer.manage");
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

	const columns = useMemo<DataTableColumnDef<AssetStockRow>[]>(
		() => [
			{
				id: "name",
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Item" />
				),
				cell: ({ row }) => (
					<div className="flex flex-col">
						<div className="flex items-center gap-2">
							<span>{row.original.name}</span>
							{row.original.isActive ? null : (
								<StatusBadge doc="item" status="inactive" />
							)}
						</div>
						<span className="font-mono text-[13px] text-muted-foreground min-[1100px]:hidden">
							{row.original.sku}
						</span>
					</div>
				),
			},
			{
				id: "sku",
				accessorKey: "sku",
				meta: { hideBelow1100: true },
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
				meta: { hideBelow1100: true },
				header: "Average cost",
				cell: ({ getValue }) => formatMoney(getValue<number>()),
			},
			{
				id: "valuePaise",
				accessorKey: "valuePaise",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Value" />
				),
				cell: ({ getValue }) => formatMoney(getValue<number>()),
			},
			{
				id: "reorderLevel",
				accessorKey: "reorderLevel",
				enableSorting: false,
				meta: { hideBelow1100: true },
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
						<ul className="text-sm">
							{row.original.locations.map((location) => (
								<li
									key={location.locationId}
									className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1"
								>
									<span>
										{location.locationName}: {location.balance}{" "}
										{row.original.uom}
									</span>
									{canTransfer &&
									location.balance > 0 &&
									location.locationType !== "vendor_premise" ? (
										<Button type="button" variant="outline" asChild>
											<Link
												href={`/inventory/stock-transfers/new?item=${row.original.itemId}&from=${location.locationId}`}
												aria-label={`Move ${row.original.name} from ${location.locationName}`}
											>
												Move stock
											</Link>
										</Button>
									) : null}
								</li>
							))}
						</ul>
					),
			},
		],
		[canTransfer],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
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
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Stock"
				description="Current stock, value and balance by location."
			/>
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

			<DataTable
				table={table}
				isLoading={stockQuery.isLoading}
				emptyState={listEmptyState("No stock yet")}
				errorState={listErrorState(stockQuery, "The list could not be loaded.")}
			/>
		</div>
	);
}
