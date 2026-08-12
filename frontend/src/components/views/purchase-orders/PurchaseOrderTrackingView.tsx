"use client";

import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import Link from "next/link";

import { PurchaseOrderTrackingCards } from "@/components/pages/purchase-orders/PurchaseOrderTrackingCards";
import { PurchaseRequisitionsPagination } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsPagination";
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

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<Button type="button" variant="ghost" size="sm" className="w-fit" asChild>
				<Link href="/purchase-orders">
					<IconArrowLeft className="size-3.5" />
					Back to queue
				</Link>
			</Button>

			<div>
				<h1 className="font-heading text-lg font-medium">
					Purchase order tracking
				</h1>
				<p className="text-xs text-muted-foreground">
					Track every PO through approval, dispatch, and receipt.
				</p>
			</div>

			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<Select
						value={statusFilter}
						onValueChange={(value) =>
							onStatusFilterChange(value as "active" | POStatus)
						}
					>
						<SelectTrigger className="w-full sm:w-64">
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

					<div className="relative w-full sm:max-w-sm">
						<IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={qInput}
							onChange={(event) => onQChange(event.target.value)}
							placeholder="Search PO number or notes"
							className="pl-7"
						/>
					</div>

					<Select
						value={sortBy}
						onValueChange={(value) => onSortByChange(value as POSortField)}
					>
						<SelectTrigger className="w-full sm:w-40">
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
				</div>

				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					<div className="flex items-center gap-2">
						<span>Asc</span>
						<Switch
							checked={sortDir === "desc"}
							onCheckedChange={onSortDirectionChange}
							aria-label="Toggle sort direction"
						/>
						<span>Dsc</span>
					</div>
					<div className="flex items-center gap-2">
						<Switch
							checked={overdueOnly}
							onCheckedChange={onOverdueToggle}
							aria-label="Toggle overdue only"
						/>
						<span>Overdue only</span>
					</div>
				</div>
			</div>

			<PurchaseOrderTrackingCards
				purchaseOrders={purchaseOrders}
				isLoading={poQuery.isLoading}
			/>

			<PurchaseRequisitionsPagination
				page={page}
				pageSize={pageSize}
				meta={meta}
				onPageChange={setPage}
				onPageSizeChange={onPageSizeChange}
			/>
		</div>
	);
}
