"use client";

import {
	IconArrowDown,
	IconArrowsSort,
	IconArrowUp,
} from "@tabler/icons-react";
import type { RowData } from "@tanstack/react-table";

import type { DataTableColumn } from "@/components/common/data-table-features";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataTableColumnHeaderProps<TData extends RowData, TValue> = {
	column: DataTableColumn<TData, TValue>;
	title: string;
	className?: string;
};

export function DataTableColumnHeader<TData extends RowData, TValue>({
	column,
	title,
	className,
}: DataTableColumnHeaderProps<TData, TValue>) {
	if (!column.getCanSort()) {
		return <div className={className}>{title}</div>;
	}

	const sorted = column.getIsSorted();

	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(className)}
			onClick={() => column.toggleSorting(sorted === "asc")}
		>
			{title}
			{sorted === "asc" ? (
				<IconArrowUp data-icon="inline-end" />
			) : sorted === "desc" ? (
				<IconArrowDown data-icon="inline-end" />
			) : (
				<IconArrowsSort data-icon="inline-end" />
			)}
		</Button>
	);
}
