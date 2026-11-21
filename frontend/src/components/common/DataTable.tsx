"use client";

import { flexRender, type RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { DataTablePagination } from "@/components/common/DataTablePagination";
import type {
	DataTableColumnMeta,
	DataTableInstance,
} from "@/components/common/data-table-features";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

import { cn } from "@/lib/utils";

const SKELETON_ROWS = 8;

function isNumeric(meta: DataTableColumnMeta | undefined) {
	return meta?.numeric === true;
}

type DataTableProps<TData extends RowData> = {
	table: DataTableInstance<TData>;
	isLoading?: boolean;
	rowClassName?: (row: TData) => string | undefined;
	/** Mouse click anywhere on a row. Keyboard users act through a control inside the row. */
	onRowClick?: (row: TData) => void;
	/** Rendered in place of the empty row. */
	emptyState?: ReactNode;
	/** Rendered when set instead of the body. */
	errorState?: ReactNode;
	/** Skeleton row count while loading (default 8). */
	skeletonRows?: number;
	/** Hide the built-in pager when the view renders the shared `Pagination`. */
	hidePagination?: boolean;
};

// Render-only: owns header/body/skeleton/pagination markup for any TanStack Table
// instance. Fetching, columns, sorting/pagination state stay with the feature
// component that builds `table` — this just draws it.
export function DataTable<TData extends RowData>({
	table,
	isLoading,
	rowClassName,
	onRowClick,
	emptyState,
	errorState,
	skeletonRows = SKELETON_ROWS,
	hidePagination,
}: DataTableProps<TData>) {
	const rows = table.getRowModel().rows;
	const leafColumns = table.getVisibleLeafColumns();

	return (
		<>
			<Table aria-busy={isLoading ? true : undefined}>
				<TableHeader className="[&_tr]:bg-table-header [&_tr]:hover:bg-table-header">
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead
									key={header.id}
									scope="col"
									className={cn(
										isNumeric(header.column.columnDef.meta) &&
											"text-right tabular-nums",
									)}
								>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{isLoading ? (
						Array.from({ length: skeletonRows }, (_, rowIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton row count, never reorders
							<TableRow key={`skeleton-row-${rowIndex}`}>
								{leafColumns.map((column) => (
									<TableCell key={column.id}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								))}
							</TableRow>
						))
					) : errorState ? (
						<TableRow className="hover:bg-transparent">
							<TableCell colSpan={leafColumns.length} className="h-auto">
								{errorState}
							</TableCell>
						</TableRow>
					) : rows.length === 0 ? (
						<TableRow className="hover:bg-transparent">
							<TableCell
								colSpan={leafColumns.length}
								className={cn(
									"text-center text-muted-foreground",
									emptyState && "h-auto",
								)}
							>
								{emptyState ?? "No results."}
							</TableCell>
						</TableRow>
					) : (
						rows.map((row) => (
							<TableRow
								key={row.id}
								className={cn(
									onRowClick && "cursor-pointer",
									rowClassName?.(row.original),
								)}
								onClick={
									onRowClick ? () => onRowClick(row.original) : undefined
								}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell
										key={cell.id}
										className={cn(
											isNumeric(cell.column.columnDef.meta) &&
												"text-right tabular-nums",
										)}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			{hidePagination ? null : <DataTablePagination table={table} />}
		</>
	);
}
