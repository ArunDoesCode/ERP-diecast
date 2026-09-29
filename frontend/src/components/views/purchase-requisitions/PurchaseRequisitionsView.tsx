"use client";

import { IconPlus, IconSearch } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { PurchaseRequisitionsCards } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsCards";
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
	type SearchField,
	usePRListControls,
} from "@/components/views/purchase-requisitions/use-pr-list-controls";
import { useCan } from "@/hooks/use-can";
import { usePurchaseRequisitionsQuery } from "@/lib/api/purchase-requisitions/queries";
import {
	type PRStatus,
	type PRType,
	prStatusValues,
	prTypeValues,
} from "@/types/purchase-requisitions";

const CreatePurchaseRequisitionModal = dynamic(() =>
	import(
		"@/components/pages/purchase-requisitions/PurchaseRequisitionModals"
	).then((module) => module.CreatePurchaseRequisitionModal),
);

const EditPurchaseRequisitionModal = dynamic(() =>
	import(
		"@/components/pages/purchase-requisitions/PurchaseRequisitionModals"
	).then((module) => module.EditPurchaseRequisitionModal),
);

export function PurchaseRequisitionsView() {
	const {
		onPRNumberChange,
		onPageSizeChange,
		onSearchFieldChange,
		onSortDirectionChange,
		onStatusFilterChange,
		onTypeFilterChange,
		page,
		pageSize,
		prNumberSearch,
		q,
		searchField,
		setPage,
		sortDir,
		statusFilter,
		typeFilter,
	} = usePRListControls();

	const [createOpen, setCreateOpen] = useState(false);
	const [selectedPrId, setSelectedPrId] = useState<number | null>(null);
	const [editOpen, setEditOpen] = useState(false);
	const canLinkMachine = useCan("pr.link_machine");

	const requisitionsQuery = usePurchaseRequisitionsQuery({
		page,
		pageSize,
		q: q || undefined,
		sortBy: "createdAt",
		sortDir,
	});

	const requisitions = requisitionsQuery.data?.data ?? [];

	const meta = requisitionsQuery.data?.meta;

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<Select
						value={searchField}
						onValueChange={(value) => onSearchFieldChange(value as SearchField)}
					>
						<SelectTrigger className="w-full sm:w-52">
							<SelectValue placeholder="Filter field" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="prNumber">PR Number</SelectItem>
							<SelectItem value="status">Status</SelectItem>
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

					{searchField === "status" ? (
						<Select
							value={statusFilter}
							onValueChange={(value) =>
								onStatusFilterChange(value as "all" | PRStatus)
							}
						>
							<SelectTrigger className="w-full sm:w-52">
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All statuses</SelectItem>
								{prStatusValues.map((status) => (
									<SelectItem key={status} value={status}>
										{status}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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

				<div className="flex flex-col items-start gap-2">
					<Button onClick={() => setCreateOpen(true)}>
						<IconPlus className="size-3.5" />
						Create PR
					</Button>

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
			</div>

			<PurchaseRequisitionsCards
				requisitions={requisitions}
				isLoading={requisitionsQuery.isLoading}
				onSelect={(prId) => {
					setSelectedPrId(prId);
					setEditOpen(true);
				}}
			/>

			<PurchaseRequisitionsPagination
				page={page}
				pageSize={pageSize}
				meta={meta}
				onPageChange={setPage}
				onPageSizeChange={onPageSizeChange}
			/>

			{createOpen ? (
				<CreatePurchaseRequisitionModal
					open={createOpen}
					onOpenChange={setCreateOpen}
					canLinkMachine={canLinkMachine}
				/>
			) : null}

			{editOpen && selectedPrId != null ? (
				<EditPurchaseRequisitionModal
					prId={selectedPrId}
					open={editOpen}
					onOpenChange={(nextOpen) => {
						setEditOpen(nextOpen);
						if (!nextOpen) {
							setSelectedPrId(null);
						}
					}}
					canLinkMachine={canLinkMachine}
				/>
			) : null}
		</div>
	);
}
