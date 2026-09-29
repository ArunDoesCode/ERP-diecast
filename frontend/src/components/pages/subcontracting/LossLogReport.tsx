"use client";

import Link from "next/link";
import { useState } from "react";

import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { PurchaseRequisitionsPagination } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsPagination";
import {
	DateRangeFilter,
	SortableHead,
	VendorFilter,
} from "@/components/pages/subcontracting/ReportFilters";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useLossLogQuery } from "@/lib/api/subcontracting/queries";
import { formatScoDate } from "@/lib/sco-format";
import type { LossLogSortField } from "@/types/subcontracting";

export function LossLogReport() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [vendorId, setVendorId] = useState<number | undefined>();
	const [range, setRange] = useState({ from: "", to: "" });
	const [sortBy, setSortBy] = useState<LossLogSortField>("createdAt");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const query = useLossLogQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		vendorId,
		createdFrom: range.from || undefined,
		createdTo: range.to || undefined,
	});
	const rows = query.data?.data ?? [];

	function onSort(field: LossLogSortField) {
		if (field === sortBy) setSortDir(sortDir === "asc" ? "desc" : "asc");
		else {
			setSortBy(field);
			setSortDir("desc");
		}
		setPage(1);
	}

	const sortProps = { sortBy, sortDir, onSort };

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<VendorFilter
					value={vendorId}
					onChange={(next) => {
						setVendorId(next);
						setPage(1);
					}}
				/>
				<DateRangeFilter
					idPrefix="loss-log"
					from={range.from}
					to={range.to}
					onChange={(next) => {
						setRange(next);
						setPage(1);
					}}
				/>
			</div>
			<Card>
				<CardContent>
					{query.isLoading ? (
						<Skeleton className="h-32" />
					) : rows.length === 0 ? (
						<p className="py-6 text-center text-muted-foreground">
							No losses recorded.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead label="Date" field="createdAt" {...sortProps} />
									<TableHead>SCO</TableHead>
									<TableHead>Vendor</TableHead>
									<TableHead>Item</TableHead>
									<SortableHead
										label="Qty"
										field="qty"
										className="text-right"
										{...sortProps}
									/>
									<SortableHead
										label="Cost"
										field="costPaise"
										className="text-right"
										{...sortProps}
									/>
									<TableHead>Reason</TableHead>
									<TableHead>By</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.ledgerId}>
										<TableCell>{formatScoDate(row.createdAt)}</TableCell>
										<TableCell>
											<Link
												href={`/subcontracting/${row.scoId}`}
												className="underline-offset-2 hover:underline"
											>
												{row.scoNumber}
											</Link>
										</TableCell>
										<TableCell>{row.vendorName}</TableCell>
										<TableCell>
											{row.itemSku} · {row.itemName}
											{row.batchNumber ? (
												<span className="block text-[11px] text-muted-foreground">
													Batch {row.batchNumber}
												</span>
											) : null}
										</TableCell>
										<TableCell className="text-right">{row.qty}</TableCell>
										<TableCell className="text-right">
											{formatPaise(row.costPaise)}
										</TableCell>
										<TableCell className="max-w-64 whitespace-normal">
											{row.reason}
										</TableCell>
										<TableCell>{row.createdByName ?? "-"}</TableCell>
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
