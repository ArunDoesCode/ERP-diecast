"use client";

import { IconListCheck, IconSearch } from "@tabler/icons-react";
import Link from "next/link";

import { PurchaseOrdersQueueCards } from "@/components/pages/purchase-orders/PurchaseOrdersQueueCards";
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
	type POQueueSearchField,
	usePOQueueControls,
} from "@/components/views/purchase-orders/use-po-queue-controls";
import { usePurchaseRequisitionsQuery } from "@/lib/api/purchase-requisitions/queries";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import { type PRType, prTypeValues } from "@/types/purchase-requisitions";

export function PurchaseOrdersView() {
	const role = useAuthSessionStore((state) => state.role);
	const canSeeTracking = role !== "floor_supervisor";

	const {
		onPRNumberChange,
		onPageSizeChange,
		onSearchFieldChange,
		onSortDirectionChange,
		onTypeFilterChange,
		page,
		pageSize,
		prNumberSearch,
		q,
		searchField,
		setPage,
		sortDir,
		typeFilter,
	} = usePOQueueControls();

	const queueQuery = usePurchaseRequisitionsQuery({
		page,
		pageSize,
		sortBy: "createdAt",
		sortDir,
		status: ["approved", "partial_ordered"],
		q,
	});

	const requisitions = queueQuery.data?.data ?? [];
	const meta = queueQuery.data?.meta;

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="font-heading text-lg font-medium">Purchase orders</h1>
					<p className="text-xs text-muted-foreground">
						Approved PR lines waiting for PO draft.
					</p>
				</div>

				{canSeeTracking ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-fit"
						asChild
					>
						<Link href="/purchase-orders/tracking">
							<IconListCheck className="size-3.5" />
							PO tracking
						</Link>
					</Button>
				) : null}
			</div>

			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<Select
						value={searchField}
						onValueChange={(value) =>
							onSearchFieldChange(value as POQueueSearchField)
						}
					>
						<SelectTrigger className="w-full sm:w-52">
							<SelectValue placeholder="Filter field" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="prNumber">PR Number</SelectItem>
							<SelectItem value="type">Type</SelectItem>
						</SelectContent>
					</Select>

					{searchField === "prNumber" ? (
						<div className="relative w-full sm:max-w-sm">
							<IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={prNumberSearch}
								onChange={(event) => onPRNumberChange(event.target.value)}
								placeholder="Search PR number"
								className="pl-7"
							/>
						</div>
					) : null}

					{searchField === "type" ? (
						<Select
							value={typeFilter}
							onValueChange={(value) =>
								onTypeFilterChange(value as "all" | PRType)
							}
						>
							<SelectTrigger className="w-full sm:w-52">
								<SelectValue placeholder="Select type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All types</SelectItem>
								{prTypeValues.map((type) => (
									<SelectItem key={type} value={type}>
										{type}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}
				</div>

				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Asc</span>
					<Switch
						checked={sortDir === "desc"}
						onCheckedChange={onSortDirectionChange}
						aria-label="Toggle sort direction"
					/>
					<span>Dsc</span>
				</div>
			</div>

			<PurchaseOrdersQueueCards
				requisitions={requisitions}
				isLoading={queueQuery.isLoading}
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
