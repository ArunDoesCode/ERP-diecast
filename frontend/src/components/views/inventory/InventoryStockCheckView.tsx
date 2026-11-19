"use client";

import { IconCircleCheck } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import {
	useLocationsQuery,
	useReconciliationQuery,
} from "@/lib/api/asset/queries";
import { formatQty } from "@/lib/format";
import type { AssetReconciliationRow } from "@/types/asset";

const KIND_LABEL: Record<AssetReconciliationRow["kind"], string> = {
	item_stock: "Item total",
	item_location_balance: "Item at location",
};

// BR-INV-29: read-only list of ledger mismatches; fixing is a stock-take.
export function InventoryStockCheckView() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	const query = useReconciliationQuery({
		page,
		pageSize,
		sortBy: "itemId",
		sortDir: "asc",
	});
	const locationsQuery = useLocationsQuery({ page: 1, pageSize: 100 });

	const locationNames = useMemo(() => {
		const map = new Map<number, string>();
		for (const location of locationsQuery.data?.data ?? []) {
			map.set(location.id, location.name);
		}
		return map;
	}, [locationsQuery.data]);

	const columns = useMemo<DataTableColumnDef<AssetReconciliationRow>[]>(
		() => [
			{
				id: "kind",
				header: "Kind",
				cell: ({ row }) => KIND_LABEL[row.original.kind],
			},
			{
				id: "sku",
				header: "SKU",
				cell: ({ row }) => (
					<span className="font-mono">{row.original.itemSku}</span>
				),
			},
			{
				id: "location",
				header: "Location",
				cell: ({ row }) =>
					row.original.locationId === null
						? "–"
						: (locationNames.get(row.original.locationId) ??
							`Location ${row.original.locationId}`),
			},
			{
				id: "storedQty",
				header: "Stored qty",
				meta: { numeric: true },
				cell: ({ row }) => formatQty(row.original.storedQty, null, 3),
			},
			{
				id: "ledgerQty",
				header: "Ledger qty",
				meta: { numeric: true },
				cell: ({ row }) => formatQty(row.original.ledgerQty, null, 3),
			},
			{
				id: "difference",
				header: "Difference",
				meta: { numeric: true },
				cell: ({ row }) =>
					formatQty(row.original.storedQty - row.original.ledgerQty, null, 3),
			},
		],
		[locationNames],
	);

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
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
				title="Stock check"
				description="Items whose stored stock differs from the ledger. A real difference is fixed by a stock-take."
			/>
			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					<EmptyState
						icon={IconCircleCheck}
						title="Stock agrees with the ledger"
					/>
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={
								query.error instanceof Error
									? query.error.message
									: "The stock check could not be loaded."
							}
							onRetry={() => {
								void query.refetch();
							}}
							retrying={query.isRefetching}
						/>
					) : undefined
				}
			/>
			<Pagination
				page={page}
				pageSize={pageSize}
				total={query.data?.meta.total ?? 0}
				onPageChange={setPage}
				onPageSizeChange={(size) => {
					setPageSize(size);
					setPage(1);
				}}
			/>
		</div>
	);
}
