"use client";

import { IconFileOff, IconSearch, IconX } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
	type GrnGroup,
	useGrnTrackingControls,
} from "@/components/views/grn/use-grn-tracking-controls";
import { useCan } from "@/hooks/use-can";
import type { GrnListRowV2 } from "@/lib/api/grn/list-types";
import { useGrnsQuery } from "@/lib/api/grn/queries";
import { formatDate, formatDocNo } from "@/lib/format";
import type { GrnSortField } from "@/types/grn";

const SORT_FIELDS: Array<{ label: string; value: GrnSortField }> = [
	{ label: "Newest first", value: "id" },
	{ label: "GRN number", value: "grnNumber" },
	{ label: "Status", value: "status" },
	{ label: "Received date", value: "receivedDate" },
];

const BUCKET_LABEL = { late: "Late", today: "Today", later: "Later" } as const;

function makeColumns(): DataTableColumnDef<GrnListRowV2>[] {
	return [
		{
			accessorKey: "grnNumber",
			header: "GRN no.",
			cell: ({ row }) => (
				<Link
					href={`/grn/${row.original.id}`}
					className="font-mono text-brand-accent hover:underline"
				>
					{formatDocNo(row.original.grnNumber)}
				</Link>
			),
		},
		{
			accessorKey: "receivedDate",
			header: "Date",
			cell: ({ row }) => formatDate(row.original.receivedDate),
		},
		{
			accessorKey: "poNumber",
			header: "PO",
			// Plain text unless the viewer may open POs (BR-FF-03).
			cell: ({ row }) => {
				const { poNumber, poId, poCanOpen } = row.original;
				if (!poNumber) return "–";
				return poCanOpen && poId ? (
					<Link
						href={`/purchase-orders/${poId}`}
						className="font-mono text-brand-accent hover:underline"
					>
						{formatDocNo(poNumber)}
					</Link>
				) : (
					<span className="font-mono">{formatDocNo(poNumber)}</span>
				);
			},
		},
		{
			accessorKey: "supplierName",
			header: "Supplier",
			cell: ({ row }) => row.original.supplierName ?? "–",
		},
		{
			accessorKey: "challanNo",
			header: "Challan",
			cell: ({ row }) => row.original.challanNo ?? "–",
		},
		{
			accessorKey: "lineCount",
			header: "Lines",
			meta: { numeric: true },
			cell: ({ row }) => row.original.lineCount ?? "–",
		},
		{
			id: "qa",
			header: "QA status",
			cell: ({ row }) =>
				row.original.qaSummary ? (
					<StatusBadge doc="grnQa" status={row.original.qaSummary} />
				) : (
					"–"
				),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge doc="grn" status={row.original.status} />,
		},
	];
}

const columns = makeColumns();

export function GrnView() {
	const canReceive = useCan("grn.edit_draft");
	const {
		bucket,
		clearBucket,
		filtersActive,
		group,
		onGroupChange,
		onPageSizeChange,
		onQChange,
		onSortByChange,
		onSortDirectionChange,
		page,
		pageSize,
		q,
		qInput,
		qaStatus,
		resetFilters,
		setPage,
		sortBy,
		sortDir,
		status,
	} = useGrnTrackingControls();

	const grnQuery = useGrnsQuery({
		page,
		pageSize,
		sortBy,
		sortDir,
		status,
		qaStatus,
		bucket: bucket ?? undefined,
		q,
	});

	const grns = useMemo(() => grnQuery.data?.data ?? [], [grnQuery.data]);
	const total = grnQuery.data?.meta.total ?? 0;
	const counts = grnQuery.data?.meta.statusCounts;

	// BR-FF-109 groups. "All" = every status; Done = accepted + partly accepted.
	// QA pending overlaps Draft (a draft can hold pending lines).
	const sum = (...keys: string[]) =>
		counts ? keys.reduce((n, k) => n + (counts[k] ?? 0), 0) : undefined;
	const quick = [
		{
			key: "all",
			label: "All",
			count: counts
				? Object.values(counts).reduce((n, v) => n + v, 0)
				: undefined,
		},
		{ key: "draft", label: "Draft", count: sum("draft") },
		{
			key: "qa_pending",
			label: "QA pending",
			count: counts ? (counts.qa_pending ?? counts.pending_qa ?? 0) : undefined,
		},
		{ key: "done", label: "Done", count: sum("accepted", "partial_accepted") },
		{ key: "rejected", label: "Rejected", count: sum("rejected") },
	];

	const table = useTable({
		features: dataTableFeatures,
		data: grns,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const receiveButton = canReceive ? (
		<Button asChild size="lg">
			<Link href="/grn/receive">Receive goods</Link>
		</Button>
	) : undefined;

	const emptyState = filtersActive ? (
		<EmptyState
			icon={IconFileOff}
			title="Nothing matches these filters"
			action={
				<Button type="button" variant="outline" onClick={resetFilters}>
					Reset filters
				</Button>
			}
		/>
	) : (
		<EmptyState
			icon={IconFileOff}
			title="No goods receipts yet"
			description="A GRN shows up here when goods are received against a dispatched purchase order."
			action={receiveButton}
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Goods receipt notes"
				description="Track goods received against dispatched purchase orders."
				actions={receiveButton}
			/>

			<FilterBar
				quick={quick}
				value={group ?? "all"}
				onChange={(key) =>
					onGroupChange(key === "all" ? null : (key as GrnGroup))
				}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				{bucket ? (
					<Button
						type="button"
						variant="outline"
						className="h-10"
						onClick={clearBucket}
						aria-label={`Clear the ${bucket} filter`}
					>
						{BUCKET_LABEL[bucket]} only
						<IconX className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}

				<div className="relative w-56">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={qInput}
						onChange={(event) => onQChange(event.target.value)}
						placeholder="Search GRN number"
						aria-label="Search GRN number"
						className="h-10 pl-7"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Select
						value={sortBy}
						onValueChange={(value) => onSortByChange(value as GrnSortField)}
					>
						<SelectTrigger className="h-10 w-40" aria-label="Sort by">
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

					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>Asc</span>
						<Switch
							checked={sortDir === "desc"}
							onCheckedChange={onSortDirectionChange}
							aria-label="Toggle sort direction"
						/>
						<span>Dsc</span>
					</div>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={grnQuery.isLoading}
				hidePagination
				emptyState={emptyState}
				errorState={
					grnQuery.isError ? (
						<ErrorState
							message={
								grnQuery.error instanceof Error
									? grnQuery.error.message
									: "The list could not be loaded."
							}
							onRetry={() => {
								void grnQuery.refetch();
							}}
							retrying={grnQuery.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={page}
				pageSize={pageSize}
				total={total}
				onPageChange={setPage}
				onPageSizeChange={onPageSizeChange}
			/>
		</div>
	);
}
