"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useSupplierHistoryQuery } from "@/lib/api/suppliers/queries";
import type { SupplierHistoryRow } from "@/types/suppliers";

const PAGE_SIZE = 10;
const PAISE_FIELDS = new Set([
	"supplierUnitPricePaise",
	"serviceUnitPricePaise",
]);

function formatValue(row: SupplierHistoryRow, value: string | null) {
	if (value === null || value === "") return "empty";
	if (PAISE_FIELDS.has(row.field) && /^\d+$/.test(value)) {
		return (Number(value) / 100).toLocaleString(undefined, {
			style: "currency",
			currency: "INR",
		});
	}
	return value;
}

function describeTarget(row: SupplierHistoryRow) {
	if (row.entity === "supplier") return "Supplier";
	const kind = row.entity === "item" ? "Item" : "Service";
	return `${kind} ${row.entityLabel ?? row.entityId}`;
}

export function SupplierHistoryCard({ supplierId }: { supplierId: number }) {
	const [page, setPage] = useState(1);
	const historyQuery = useSupplierHistoryQuery(supplierId, {
		page,
		pageSize: PAGE_SIZE,
	});

	const rows = historyQuery.data?.data ?? [];
	const meta = historyQuery.data?.meta;

	return (
		<Card>
			<CardHeader>
				<CardTitle>History</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{historyQuery.isError ? (
					<div className="space-y-3">
						<p className="text-sm text-destructive">Failed to load history.</p>
						<Button
							type="button"
							variant="outline"
							onClick={() => historyQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When</TableHead>
								<TableHead>Who</TableHead>
								<TableHead>What</TableHead>
								<TableHead>Field</TableHead>
								<TableHead>Change</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{historyQuery.isLoading ? (
								<TableRow>
									<TableCell colSpan={5}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								</TableRow>
							) : rows.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={5}
										className="text-center text-muted-foreground"
									>
										No changes recorded yet.
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<TableRow key={row.id}>
										<TableCell>
											{new Date(row.changedAt).toLocaleString()}
										</TableCell>
										<TableCell>
											{row.changedByName ?? `User #${row.changedBy}`}
										</TableCell>
										<TableCell>{describeTarget(row)}</TableCell>
										<TableCell>{row.field}</TableCell>
										<TableCell>
											{formatValue(row, row.oldValue)} {"→"}{" "}
											{formatValue(row, row.newValue)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				)}

				{meta && meta.totalPages > 1 ? (
					<div className="flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => setPage((current) => current - 1)}
						>
							Previous
						</Button>
						<span className="text-xs text-muted-foreground">
							Page {meta.page} of {meta.totalPages}
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={page >= meta.totalPages}
							onClick={() => setPage((current) => current + 1)}
						>
							Next
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
