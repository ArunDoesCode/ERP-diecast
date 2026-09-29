"use client";

import { useState } from "react";

import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { PurchaseRequisitionsPagination } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsPagination";
import {
	SortableHead,
	VendorFilter,
} from "@/components/pages/subcontracting/ReportFilters";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useVendorStockQuery } from "@/lib/api/subcontracting/queries";
import type { VendorStockSortField } from "@/types/subcontracting";

export function VendorStockReport() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [vendorId, setVendorId] = useState<number | undefined>();
	const [sortBy, setSortBy] = useState<VendorStockSortField>("vendorName");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

	const query = useVendorStockQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		vendorId,
	});
	const rows = query.data?.data ?? [];

	function onSort(field: VendorStockSortField) {
		if (field === sortBy) setSortDir(sortDir === "asc" ? "desc" : "asc");
		else {
			setSortBy(field);
			setSortDir("asc");
		}
		setPage(1);
	}

	const sortProps = { sortBy, sortDir, onSort };

	return (
		<div className="flex flex-col gap-4">
			<VendorFilter
				value={vendorId}
				onChange={(next) => {
					setVendorId(next);
					setPage(1);
				}}
			/>
			<Card>
				<CardContent>
					{query.isLoading ? (
						<Skeleton className="h-32" />
					) : rows.length === 0 ? (
						<p className="py-6 text-center text-muted-foreground">
							No material is at any vendor.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead
										label="Vendor"
										field="vendorName"
										{...sortProps}
									/>
									<SortableHead label="Item" field="itemSku" {...sortProps} />
									<SortableHead
										label="Qty"
										field="qty"
										className="text-right"
										{...sortProps}
									/>
									<SortableHead
										label="Value"
										field="valuePaise"
										className="text-right"
										{...sortProps}
									/>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={`${row.vendorId}-${row.itemId}`}>
										<TableCell>{row.vendorName}</TableCell>
										<TableCell>
											{row.itemSku} · {row.itemName}
										</TableCell>
										<TableCell className="text-right">{row.qty}</TableCell>
										<TableCell className="text-right">
											{formatPaise(row.valuePaise)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
			<PurchaseRequisitionsPagination
				page={page}
				pageSize={pageSize}
				meta={query.data?.meta}
				onPageChange={setPage}
				onPageSizeChange={(next) => {
					setPageSize(next);
					setPage(1);
				}}
			/>
		</div>
	);
}
