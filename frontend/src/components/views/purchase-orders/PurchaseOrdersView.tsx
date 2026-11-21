"use client";

import {
	IconAlertTriangle,
	IconFileOff,
	IconPlus,
	IconSearch,
	IconX,
} from "@tabler/icons-react";
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
	type PoGroup,
	usePOListControls,
} from "@/components/views/purchase-orders/use-po-list-controls";
import type {
	PoListQuery,
	PoListRowV2,
	PoListSortField,
} from "@/lib/api/purchase-orders/list-types";
import { usePurchaseOrdersQuery } from "@/lib/api/purchase-orders/queries";
import { formatDate, formatDocNo, formatMoney } from "@/lib/format";

const SORT_FIELDS: Array<{ label: string; value: PoListSortField }> = [
	{ label: "Newest first", value: "createdAt" },
	{ label: "PO number", value: "poNumber" },
	{ label: "Status", value: "status" },
	{ label: "Due date", value: "dueDate" },
	{ label: "Total", value: "totalAmountPaise" },
];

const BUCKET_LABEL = { late: "Late", today: "Today", later: "Later" } as const;

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

function makeColumns(today: string): DataTableColumnDef<PoListRowV2>[] {
	return [
		{
			accessorKey: "poNumber",
			header: "PO no.",
			cell: ({ row }) => (
				<Link
					href={`/purchase-orders/${row.original.id}`}
					className="font-mono text-brand-accent hover:underline"
				>
					{formatDocNo(row.original.poNumber)}
				</Link>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Date",
			cell: ({ row }) => formatDate(row.original.createdAt),
		},
		{
			accessorKey: "supplierName",
			header: "Supplier",
			cell: ({ row }) => row.original.supplierName || "–",
		},
		{
			accessorKey: "lineCount",
			header: "Lines",
			meta: { numeric: true },
			cell: ({ row }) => row.original.lineCount ?? "–",
		},
		{
			accessorKey: "totalAmountPaise",
			header: "Total",
			meta: { numeric: true },
			cell: ({ row }) => formatMoney(row.original.totalAmountPaise),
		},
		{
			id: "dueDate",
			header: "Due date",
			cell: ({ row }) => {
				const { status } = row.original;
				const due =
					row.original.dueDate ??
					row.original.revisedDeliveryDate ??
					row.original.expectedDeliveryDate;
				if (!due) return "–";
				const open = status === "dispatched" || status === "partial_received";
				const late = open && due.slice(0, 10) < today;
				return late ? (
					<span className="inline-flex items-center gap-1 font-medium text-destructive">
						<IconAlertTriangle className="size-3.5" aria-hidden="true" />
						{formatDate(due)}
						<span className="sr-only"> (late)</span>
					</span>
				) : (
					formatDate(due)
				);
			},
		},
		{
			accessorKey: "receivedPct",
			header: "Received",
			meta: { numeric: true },
			cell: ({ row }) =>
				row.original.receivedPct === undefined
					? "–"
					: `${row.original.receivedPct} %`,
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge doc="po" status={row.original.status} />,
		},
	];
}

export function PurchaseOrdersView() {
	const {
		bucket,
		clearBucket,
		clearMine,
		filtersActive,
		group,
		mine,
		onGroupChange,
		onPageSizeChange,
		onQChange,
		onSortByChange,
		onSortDirectionChange,
		page,
		pageSize,
		q,
		qInput,
		resetFilters,
		setPage,
		sortBy,
		sortDir,
		status,
	} = usePOListControls();

	const params: PoListQuery = {
		page,
		pageSize,
		q,
		status,
		mine: mine ? true : undefined,
		bucket: bucket ?? undefined,
		sortBy,
		sortDir,
	};
	const poQuery = usePurchaseOrdersQuery(params);
	const result = poQuery.data;

	const orders = useMemo(() => result?.data ?? [], [result]);
	const total = result?.meta.total ?? 0;
	const counts = result?.meta.statusCounts;

	// BR-FF-109 groups. Open = dispatched + partly received; every Late row is also Open.
	const n = (key: keyof NonNullable<typeof counts>) => counts?.[key] ?? 0;
	const quick = [
		{
			key: "all",
			label: "All",
			count: counts
				? Object.values(counts).reduce((sum, v) => sum + (v ?? 0), 0)
				: undefined,
		},
		{ key: "draft", label: "Draft", count: counts ? n("draft") : undefined },
		{
			key: "in_approval",
			label: "In approval",
			count: counts ? n("pending_approval") : undefined,
		},
		{
			key: "to_send",
			label: "To send",
			count: counts ? n("approved") : undefined,
		},
		{
			key: "open",
			label: "Open",
			count: counts ? n("dispatched") + n("partial_received") : undefined,
		},
		{ key: "late", label: "Late", count: result?.meta.lateCount },
	];

	const today = IST_DAY.format(new Date());
	const columns = useMemo(() => makeColumns(today), [today]);

	const table = useTable({
		features: dataTableFeatures,
		data: orders,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

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
			title="No purchase orders yet"
			description="Orders are made from approved requisition lines."
			action={
				<Button asChild size="lg">
					<Link href="/purchase-requisitions?toOrder=1">
						<IconPlus />
						Requisitions to order
					</Link>
				</Button>
			}
		/>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Purchase orders"
				description="Track every order through approval, sending and receipt."
				actions={
					<Button asChild size="lg" variant="outline">
						<Link href="/purchase-requisitions?toOrder=1">To order</Link>
					</Button>
				}
			/>

			<FilterBar
				quick={quick}
				value={group ?? "all"}
				onChange={(key) =>
					onGroupChange(key === "all" ? null : (key as PoGroup))
				}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				{mine ? (
					<Button
						type="button"
						variant="outline"
						className="h-10"
						onClick={clearMine}
						aria-label="Show everyone's orders"
					>
						Mine only
						<IconX className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}
				{bucket && group !== "late" ? (
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
						placeholder="Search PO number or notes"
						aria-label="Search PO number or notes"
						className="h-10 pl-7"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Select
						value={sortBy}
						onValueChange={(value) => onSortByChange(value as PoListSortField)}
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
				isLoading={poQuery.isLoading}
				hidePagination
				tight
				emptyState={emptyState}
				errorState={
					poQuery.isError ? (
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
