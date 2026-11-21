"use client";

import { IconListDetails } from "@tabler/icons-react";
import {
	type RowData,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import {
	type DataTableColumn,
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useCan } from "@/hooks/use-can";
import {
	formatDate,
	formatMoney,
	formatPercentTenths,
	formatQtyTrim,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	LINE_SORT_KEYS,
	type OnTimeLine,
	type PriceLine,
	type RatingMeasure,
	type RejectionLine,
} from "@/types/supplier-rating";

type AnyLine = OnTimeLine | RejectionLine | PriceLine;

/** PO links need po.manage, GRN links need grn.view (BR-SRT-35); plain text when the id is null. */
function DocNo({
	value,
	kind,
	id,
}: {
	value: string;
	kind: "po" | "grn";
	id: number | null;
}) {
	const canPo = useCan("po.manage");
	const canGrn = useCan("grn.view");
	const allowed = kind === "po" ? canPo : canGrn;
	if (!allowed || id === null)
		return <span className="font-mono">{value}</span>;
	return (
		<Link
			href={kind === "po" ? `/purchase-orders/${id}` : `/grn/${id}`}
			className="font-mono text-brand-accent hover:underline"
		>
			{value}
		</Link>
	);
}

function sortable<T extends RowData>(
	id: string,
	title: string,
	accessorFn: (row: T) => unknown,
) {
	return {
		id,
		accessorFn,
		header: ({ column }: { column: DataTableColumn<T> }) => (
			<DataTableColumnHeader column={column} title={title} />
		),
	};
}

const ON_TIME_COLUMNS: DataTableColumnDef<OnTimeLine>[] = [
	{
		...sortable<OnTimeLine>("poNumber", "PO no.", (r) => r.poNumber),
		cell: ({ row }) => (
			<DocNo kind="po" id={row.original.prId} value={row.original.poNumber} />
		),
	},
	{
		...sortable<OnTimeLine>("itemSku", "Item", (r) => r.itemSku),
		cell: ({ row }) => (
			<span className="flex flex-col">
				<span>{row.original.itemSku}</span>
				<span className="text-[13px] text-muted-foreground">
					{row.original.itemName}
				</span>
			</span>
		),
	},
	{
		...sortable<OnTimeLine>("dueDate", "Due", (r) => r.dueDate),
		cell: ({ row }) =>
			row.original.state === "no_due_date"
				? "No due date"
				: formatDate(row.original.dueDate),
	},
	{
		id: "revisedDate",
		header: "Revised",
		enableSorting: false,
		cell: ({ row }) => formatDate(row.original.revisedDate),
		meta: { hideBelow1100: true },
	},
	{
		...sortable<OnTimeLine>("completionDate", "Done", (r) => r.completionDate),
		cell: ({ row }) =>
			row.original.state === "open_past_due"
				? "Open"
				: formatDate(row.original.completionDate),
	},
	{
		...sortable<OnTimeLine>("daysLate", "Days late", (r) => r.daysLate),
		cell: ({ row }) => {
			const d = row.original.daysLate;
			if (row.original.state === "no_due_date" || d === null) return "–";
			return <span className={cn(d > 0 && "text-destructive")}>{d}</span>;
		},
		meta: { numeric: true },
	},
	{
		id: "verdict",
		header: "Verdict",
		enableSorting: false,
		cell: ({ row }) => {
			const { state, verdict } = row.original;
			if (state === "no_due_date") {
				return <span className="text-muted-foreground">No due date</span>;
			}
			const note =
				state === "short_closed"
					? "Short-closed"
					: state === "cancelled_after_dispatch"
						? "Cancelled after dispatch"
						: null;
			return (
				<span className="flex flex-col">
					<span className={cn(verdict === "late" && "text-destructive")}>
						{state === "open_past_due"
							? "Open, late"
							: verdict === "late"
								? "Late"
								: "On time"}
					</span>
					{note ? (
						<span className="text-[13px] text-muted-foreground">{note}</span>
					) : null}
				</span>
			);
		},
	},
];

const REJECTION_COLUMNS: DataTableColumnDef<RejectionLine>[] = [
	{
		...sortable<RejectionLine>("grnNumber", "GRN no.", (r) => r.grnNumber),
		cell: ({ row }) => (
			<span className="flex flex-col">
				<DocNo
					kind="grn"
					id={row.original.grnId}
					value={row.original.grnNumber}
				/>
				<span className="text-[13px] text-muted-foreground">
					PO{" "}
					<DocNo
						kind="po"
						id={row.original.prId}
						value={row.original.poNumber}
					/>
				</span>
				{row.original.inspection === "not_inspected" ? (
					<span className="text-[13px] whitespace-normal text-muted-foreground">
						Not inspected, not counted
					</span>
				) : null}
			</span>
		),
	},
	{
		...sortable<RejectionLine>("itemSku", "Item", (r) => r.itemSku),
		cell: ({ row }) => row.original.itemSku,
	},
	{
		...sortable<RejectionLine>(
			"receivedDate",
			"Received",
			(r) => r.receivedDate,
		),
		cell: ({ row }) => formatDate(row.original.receivedDate),
	},
	{
		id: "rejectedQty",
		header: "Rejected",
		enableSorting: false,
		// Arrived sits under the rejected quantity so the verdict columns stay on screen.
		cell: ({ row }) => (
			<div className="flex flex-col items-end">
				<span>{formatQtyTrim(row.original.rejectedQty, row.original.uom)}</span>
				<span className="text-[13px] text-muted-foreground">
					of {formatQtyTrim(row.original.arrivedQty, row.original.uom)}
				</span>
			</div>
		),
		meta: { numeric: true },
	},
	{
		...sortable<RejectionLine>(
			"rejectedValuePaise",
			"Rejected value",
			(r) => r.rejectedValuePaise,
		),
		cell: ({ row }) => formatMoney(row.original.rejectedValuePaise),
		meta: { numeric: true },
	},
];

const REFERENCE_SOURCE: Record<PriceLine["referenceSource"], string> = {
	standard_rate: "Standard rate",
	previous_po: "Previous PO",
	none: "–",
};

const NOT_COMPARED: Record<
	NonNullable<PriceLine["notComparedReason"]>,
	string
> = {
	uom_differs: "Not compared: UOM differs",
	no_reference: "Not compared: no reference rate",
};

const PRICE_COLUMNS: DataTableColumnDef<PriceLine>[] = [
	{
		...sortable<PriceLine>("poNumber", "PO no.", (r) => r.poNumber),
		cell: ({ row }) => (
			<span className="flex flex-col">
				<DocNo kind="po" id={row.original.prId} value={row.original.poNumber} />
				<span className="text-[13px] text-muted-foreground">
					{formatDate(row.original.poDate)}
				</span>
			</span>
		),
	},
	{
		...sortable<PriceLine>("itemSku", "Item", (r) => r.itemSku),
		cell: ({ row }) => row.original.itemSku,
	},
	{
		id: "qty",
		header: "Qty",
		enableSorting: false,
		cell: ({ row }) => formatQtyTrim(row.original.qty, row.original.uom),
		meta: { numeric: true },
	},
	{
		id: "ratePaise",
		header: "Rate",
		enableSorting: false,
		cell: ({ row }) => formatMoney(row.original.ratePaise),
		meta: { numeric: true },
	},
	{
		id: "referenceRatePaise",
		header: "Reference rate",
		enableSorting: false,
		// The reference source sits under the rate (Standard rate / Previous PO).
		cell: ({ row }) => (
			<div className="flex flex-col items-end">
				<span>{formatMoney(row.original.referenceRatePaise)}</span>
				{row.original.referenceSource === "none" ? null : (
					<span className="text-[13px] text-muted-foreground">
						{REFERENCE_SOURCE[row.original.referenceSource]}
					</span>
				)}
			</div>
		),
		meta: { numeric: true },
	},
	{
		...sortable<PriceLine>("variancePaise", "Variance", (r) => r.variancePaise),
		cell: ({ row }) =>
			row.original.compared ? (
				formatPercentTenths(row.original.variancePctTenths, { signed: true })
			) : (
				<span className="block max-w-36 text-[13px] whitespace-normal text-muted-foreground">
					{row.original.notComparedReason
						? NOT_COMPARED[row.original.notComparedReason]
						: "Not compared"}
				</span>
			),
		meta: { numeric: true },
	},
];

const COLUMNS: Record<RatingMeasure, DataTableColumnDef<AnyLine>[]> = {
	on_time: ON_TIME_COLUMNS as unknown as DataTableColumnDef<AnyLine>[],
	rejection: REJECTION_COLUMNS as unknown as DataTableColumnDef<AnyLine>[],
	price: PRICE_COLUMNS as unknown as DataTableColumnDef<AnyLine>[],
};

type Props = {
	measure: RatingMeasure;
	rows: AnyLine[];
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	retrying: boolean;
	sortBy: string | undefined;
	sortDir: "asc" | "desc" | undefined;
	onSortChange: (by: string | null, dir: "asc" | "desc") => void;
};

/** Lines behind one measure; sortable headers use the contract whitelist for that measure. */
export function RatingLinesTable({
	measure,
	rows,
	isLoading,
	isError,
	onRetry,
	retrying,
	sortBy,
	sortDir,
	onSortChange,
}: Props) {
	const sorting = useMemo<SortingState>(
		() => (sortBy ? [{ id: sortBy, desc: sortDir === "desc" }] : []),
		[sortBy, sortDir],
	);
	const keys = LINE_SORT_KEYS[measure];

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns: COLUMNS[measure],
		manualPagination: true,
		manualSorting: true,
		state: { sorting },
		onSortingChange: (updater) => {
			const next = typeof updater === "function" ? updater(sorting) : updater;
			const first = next[0];
			if (first && keys.includes(first.id)) {
				onSortChange(first.id, first.desc ? "desc" : "asc");
			} else {
				onSortChange(null, "asc");
			}
		},
	});

	return (
		<DataTable
			table={table}
			isLoading={isLoading}
			hidePagination
			emptyState={
				<EmptyState
					icon={IconListDetails}
					title="No lines for this measure in the window"
				/>
			}
			errorState={
				isError ? (
					<ErrorState
						message="Failed to load the lines."
						onRetry={onRetry}
						retrying={retrying}
					/>
				) : undefined
			}
		/>
	);
}
