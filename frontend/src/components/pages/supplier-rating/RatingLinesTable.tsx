"use client";

import { IconListDetails } from "@tabler/icons-react";
import {
	type RowData,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
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
import {
	formatDate,
	formatMoney,
	formatPercentTenths,
	formatQty,
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

/** PO / GRN numbers are plain text: the contract carries no PR or GRN id to link by (BR-SRT-35 gap, see report). */
function DocNo({ value }: { value: string }) {
	return <span className="font-mono">{value}</span>;
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
		cell: ({ row }) => <DocNo value={row.original.poNumber} />,
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
				<DocNo value={row.original.grnNumber} />
				{row.original.inspection === "not_inspected" ? (
					<span className="text-[13px] text-muted-foreground">
						Not inspected, not counted
					</span>
				) : null}
			</span>
		),
	},
	{
		id: "poNumber",
		header: "PO no.",
		enableSorting: false,
		cell: ({ row }) => <DocNo value={row.original.poNumber} />,
		meta: { hideBelow1100: true },
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
		id: "arrivedQty",
		header: "Arrived",
		enableSorting: false,
		cell: ({ row }) => formatQty(row.original.arrivedQty, row.original.uom, 3),
		meta: { numeric: true },
	},
	{
		id: "rejectedQty",
		header: "Rejected",
		enableSorting: false,
		cell: ({ row }) => formatQty(row.original.rejectedQty, row.original.uom, 3),
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
		cell: ({ row }) => <DocNo value={row.original.poNumber} />,
	},
	{
		...sortable<PriceLine>("itemSku", "Item", (r) => r.itemSku),
		cell: ({ row }) => row.original.itemSku,
	},
	{
		...sortable<PriceLine>("poDate", "PO date", (r) => r.poDate),
		cell: ({ row }) => formatDate(row.original.poDate),
	},
	{
		id: "qty",
		header: "Qty",
		enableSorting: false,
		cell: ({ row }) => formatQty(row.original.qty, row.original.uom, 3),
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
		cell: ({ row }) => formatMoney(row.original.referenceRatePaise),
		meta: { numeric: true, hideBelow1100: true },
	},
	{
		id: "referenceSource",
		header: "Reference",
		enableSorting: false,
		cell: ({ row }) => REFERENCE_SOURCE[row.original.referenceSource],
		meta: { hideBelow1100: true },
	},
	{
		...sortable<PriceLine>("variancePaise", "Variance", (r) => r.variancePaise),
		cell: ({ row }) =>
			row.original.compared ? (
				formatPercentTenths(row.original.variancePctTenths, { signed: true })
			) : (
				<span className="text-muted-foreground">
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
