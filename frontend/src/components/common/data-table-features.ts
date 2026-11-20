import {
	type Column,
	type ColumnDef,
	columnVisibilityFeature,
	type ReactTable,
	type RowData,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from "@tanstack/react-table";

export type DataTableColumnMeta = {
	/** Right-align the column (header and cells) with tabular numbers (BR-DS-19). */
	numeric?: boolean;
};

// TanStack Table v9 exposes only the features a table registers. Every list in the
// app is server-paged and server-sorted, so these three cover all of them.
export const dataTableFeatures = tableFeatures({
	columnVisibilityFeature,
	rowSortingFeature,
	rowPaginationFeature,
	columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumnDef<
	TData extends RowData,
	TValue = unknown,
> = ColumnDef<DataTableFeatures, TData, TValue>;

export type DataTableColumn<TData extends RowData, TValue = unknown> = Column<
	DataTableFeatures,
	TData,
	TValue
>;

export type DataTableInstance<TData extends RowData> = ReactTable<
	DataTableFeatures,
	TData
>;
