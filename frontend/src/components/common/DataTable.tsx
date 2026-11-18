"use client";

import { flexRender, type Table as TableInstance } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { DataTablePagination } from "@/components/common/DataTablePagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

const SKELETON_ROWS = 3;

type DataTableProps<TData> = {
	table: TableInstance<TData>;
	isLoading?: boolean;
	rowClassName?: (row: TData) => string | undefined;
	/** Not wired yet (BR-DS-07): rendered in place of the empty row. */
	emptyState?: ReactNode;
	/** Not wired yet (BR-DS-07): rendered when set instead of the body. */
	errorState?: ReactNode;
	/** Not wired yet (BR-DS-07): skeleton row count while loading. */
	skeletonRows?: number;
};

// Render-only: owns header/body/skeleton/pagination markup for any TanStack Table
// instance. Fetching, columns, sorting/pagination state stay with the feature
// component that builds `table` — this just draws it.
export function DataTable<TData>({
	table,
	isLoading,
	rowClassName,
}: DataTableProps<TData>) {
	const rows = table.getRowModel().rows;
	const leafColumns = table.getVisibleLeafColumns();

	return (
		<>
			<Table className="text-(length:--table-text-size) [&_td]:h-(--row-height) [&_td]:py-0">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
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
						Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton row count, never reorders
							<TableRow key={`skeleton-row-${rowIndex}`}>
								{leafColumns.map((column) => (
									<TableCell key={column.id}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								))}
							</TableRow>
						))
					) : rows.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={leafColumns.length}
								className="text-center text-muted-foreground"
							>
								No results.
							</TableCell>
						</TableRow>
					) : (
						rows.map((row) => (
							<TableRow key={row.id} className={rowClassName?.(row.original)}>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			<DataTablePagination table={table} />
		</>
	);
}
