"use client";

import {
	IconArrowDown,
	IconArrowsSort,
	IconArrowUp,
} from "@tabler/icons-react";
import type { Column } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataTableColumnHeaderProps<TData, TValue> = {
	column: Column<TData, TValue>;
	title: string;
	className?: string;
};

export function DataTableColumnHeader<TData, TValue>({
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
