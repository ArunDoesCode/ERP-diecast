"use client";

import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import Link from "next/link";

import { PurchaseOrderTrackingCards } from "@/components/pages/purchase-orders/PurchaseOrderTrackingCards";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	PO_TRACKING_STATUS_OPTIONS,
	usePOTrackingControls,
} from "@/components/views/purchase-orders/use-po-tracking-controls";
import { usePurchaseOrdersQuery } from "@/lib/api/purchase-orders/queries";
import type { POSortField, POStatus } from "@/types/purchase-orders";

const SORT_FIELDS: Array<{ label: string; value: POSortField }> = [
	{ label: "Created", value: "createdAt" },
	{ label: "PO number", value: "poNumber" },
	{ label: "Status", value: "status" },
];

export function PurchaseOrderTrackingView() {
	const {
		onOverdueToggle,
		onPageSizeChange,
		onQChange,
		onSortByChange,
		onSortDirectionChange,
		onStatusFilterChange,
		overdueOnly,
		page,
		pageSize,
		q,
		qInput,
		setPage,
		sortBy,
		sortDir,
		status,
		statusFilter,
	} = usePOTrackingControls();

	const poQuery = usePurchaseOrdersQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		status,
		q,
		overdue: overdueOnly ? true : undefined,
	});

	const purchaseOrders = poQuery.data?.data ?? [];
	const meta = poQuery.data?.meta;

	const filtersActive =
		statusFilter !== "active" || overdueOnly || qInput.trim() !== "";

	function resetFilters() {
		onQChange("");
		onStatusFilterChange("active");
		onOverdueToggle(false);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Purchase order tracking"
				description="Track every PO through approval, dispatch, and receipt."
				actions={
					<Button type="button" variant="outline" size="sm" asChild>
						<Link href="/purchase-orders">
							<IconArrowLeft />
							Back to queue
						</Link>
					</Button>
				}
			/>

			<FilterBar
				value="all"
				onChange={() => {}}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<Select
					value={statusFilter}
					onValueChange={(value) =>
						onStatusFilterChange(value as "active" | POStatus)
					}
				>
					<SelectTrigger className="w-60" aria-label="Status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						{PO_TRACKING_STATUS_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="relative w-52">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={qInput}
						onChange={(event) => onQChange(event.target.value)}
						placeholder="Search PO number or notes"
						aria-label="Search PO number or notes"
						className="pl-7"
					/>
				</div>

				<Select
					value={sortBy}
					onValueChange={(value) => onSortByChange(value as POSortField)}
				>
					<SelectTrigger className="w-36" aria-label="Sort by">
						<SelectValue placeholder="Sort by" />
					</SelectTrigger>
					<SelectContent>
						{SORT_FIELDS.map((field) => (
							<SelectItem key={field.value} value={field.value}>
								{field.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Asc</span>
					<Switch
						checked={sortDir === "desc"}
						onCheckedChange={onSortDirectionChange}
						aria-label="Toggle sort direction"
					/>
					<span>Dsc</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Switch
						checked={overdueOnly}
						onCheckedChange={onOverdueToggle}
						aria-label="Toggle overdue only"
					/>
					<span>Overdue only</span>
				</div>
			</FilterBar>

			{poQuery.isError ? (
				<ErrorState
					message={
						poQuery.error instanceof Error
							? poQuery.error.message
							: "The list could not be loaded."
					}
					onRetry={() => {
						void poQuery.refetch();
					}}
					retrying={poQuery.isRefetching}
				/>
			) : (
				<PurchaseOrderTrackingCards
					purchaseOrders={purchaseOrders}
					isLoading={poQuery.isLoading}
					filtersActive={filtersActive}
					onResetFilters={resetFilters}
				/>
			)}

			<Pagination
				page={page}
				pageSize={pageSize}
				total={meta?.total ?? 0}
				onPageChange={setPage}
				onPageSizeChange={onPageSizeChange}
			/>
		</div>
	);
}
