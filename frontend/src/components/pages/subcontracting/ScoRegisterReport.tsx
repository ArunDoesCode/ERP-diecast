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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { SCO_STATUS_FILTER_OPTIONS } from "@/components/views/subcontracting/use-sco-controls";
import { useScosQuery } from "@/lib/api/subcontracting/queries";
import {
	formatScoDate,
	getScoStatusBadgeStyle,
	SCO_STATUS_LABEL,
} from "@/lib/sco-format";
import type { ScoSortField, ScoStatus } from "@/types/subcontracting";

export function ScoRegisterReport() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [status, setStatus] = useState<"all" | ScoStatus>("all");
	const [vendorId, setVendorId] = useState<number | undefined>();
	const [range, setRange] = useState({ from: "", to: "" });
	const [sortBy, setSortBy] = useState<ScoSortField>("createdAt");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const query = useScosQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		status: status === "all" ? undefined : status,
		vendorId,
		createdFrom: range.from || undefined,
		createdTo: range.to || undefined,
	});
	const rows = query.data?.data ?? [];

	function onSort(field: ScoSortField) {
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
				<div>
					<span className="mb-1 block text-xs font-medium">Status</span>
					<Select
						value={status}
						onValueChange={(value) => {
							setStatus(value as "all" | ScoStatus);
							setPage(1);
						}}
					>
						<SelectTrigger className="w-full sm:w-56" aria-label="Status">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							{SCO_STATUS_FILTER_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<VendorFilter
					value={vendorId}
					onChange={(next) => {
						setVendorId(next);
						setPage(1);
					}}
				/>
				<DateRangeFilter
					idPrefix="sco-register"
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
							No orders match.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead label="SCO" field="scoNumber" {...sortProps} />
									<TableHead>Vendor</TableHead>
									<SortableHead label="Status" field="status" {...sortProps} />
									<SortableHead
										label="Created"
										field="createdAt"
										{...sortProps}
									/>
									<SortableHead
										label="Return date"
										field="expectedReturnDate"
										{...sortProps}
									/>
									<TableHead className="text-right">Total</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((sco) => {
									const badge = getScoStatusBadgeStyle(sco.status);
									return (
										<TableRow key={sco.id}>
											<TableCell>
												<Link
													href={`/subcontracting/${sco.id}`}
													className="font-medium underline-offset-2 hover:underline"
												>
													{sco.scoNumber}
												</Link>
											</TableCell>
											<TableCell>{sco.vendorName}</TableCell>
											<TableCell>
												<Badge
													variant={badge.variant}
													className={badge.className}
												>
													{SCO_STATUS_LABEL[sco.status]}
												</Badge>
											</TableCell>
											<TableCell>{formatScoDate(sco.createdAt)}</TableCell>
											<TableCell>
												{formatScoDate(sco.expectedReturnDate)}
											</TableCell>
											<TableCell className="text-right">
												{formatPaise(sco.totalAmountPaise)}
											</TableCell>
										</TableRow>
									);
								})}
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
