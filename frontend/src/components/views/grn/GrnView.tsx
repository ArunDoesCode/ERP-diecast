"use client";

import { IconSearch } from "@tabler/icons-react";

import { GrnTrackingTable } from "@/components/pages/grn/GrnTrackingTable";
import { PurchaseRequisitionsPagination } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsPagination";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useGrnTrackingControls } from "@/components/views/grn/use-grn-tracking-controls";
import { useGrnsQuery } from "@/lib/api/grn/queries";
import { humanizeStatusLabel } from "@/lib/pr-status-badge";
import {
	type GrnQaStatus,
	type GrnSortField,
	type GrnStatus,
	grnQaStatusValues,
	grnStatusValues,
} from "@/types/grn";

const SORT_FIELDS: Array<{ label: string; value: GrnSortField }> = [
	{ label: "ID", value: "id" },
	{ label: "GRN number", value: "grnNumber" },
	{ label: "Status", value: "status" },
	{ label: "Received date", value: "receivedDate" },
];

export function GrnView() {
	const {
		onPageSizeChange,
		onQChange,
		onQaStatusFilterChange,
		onSortByChange,
		onSortDirectionChange,
		onStatusFilterChange,
		page,
		pageSize,
		q,
		qInput,
		qaStatus,
		qaStatusFilter,
		setPage,
		sortBy,
		sortDir,
		status,
		statusFilter,
	} = useGrnTrackingControls();

	const grnQuery = useGrnsQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		status,
		qaStatus,
		q,
	});

	const grns = grnQuery.data?.data ?? [];
	const meta = grnQuery.data?.meta;

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div>
				<h1 className="font-heading text-lg font-medium">
					Goods receipt notes
				</h1>
				<p className="text-xs text-muted-foreground">
					Track goods received against dispatched purchase orders.
				</p>
			</div>

			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<Select
						value={statusFilter}
						onValueChange={(value) =>
							onStatusFilterChange(value as "all" | GrnStatus)
						}
					>
						<SelectTrigger className="w-full sm:w-48">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All statuses</SelectItem>
							{grnStatusValues.map((option) => (
								<SelectItem key={option} value={option}>
									{humanizeStatusLabel(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select
						value={qaStatusFilter}
						onValueChange={(value) =>
							onQaStatusFilterChange(value as "all" | GrnQaStatus)
						}
					>
						<SelectTrigger className="w-full sm:w-48">
							<SelectValue placeholder="QA status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All QA statuses</SelectItem>
							{grnQaStatusValues.map((option) => (
								<SelectItem key={option} value={option}>
									{humanizeStatusLabel(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="relative w-full sm:max-w-sm">
						<IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={qInput}
							onChange={(event) => onQChange(event.target.value)}
							placeholder="Search GRN number"
							className="pl-7"
						/>
					</div>

					<Select
						value={sortBy}
						onValueChange={(value) => onSortByChange(value as GrnSortField)}
					>
						<SelectTrigger className="w-full sm:w-44">
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

			<GrnTrackingTable grns={grns} isLoading={grnQuery.isLoading} />

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
