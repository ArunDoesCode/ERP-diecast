"use client";

import {
	type ColumnDef,
	getCoreRowModel,
	type PaginationState,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";

import { DataTable } from "@/components/common/DataTable";
import { useAccessLogQuery } from "@/lib/api/setup/queries";
import type { AccessLogEntry } from "@/types/setup";

function formatJson(value: unknown) {
	return value === null || value === undefined ? "-" : JSON.stringify(value);
}

const columns: ColumnDef<AccessLogEntry>[] = [
	{
		id: "at",
		header: "When",
		cell: ({ row }) => new Date(row.original.at).toLocaleString(),
	},
	{
		id: "actor",
		header: "Who",
		cell: ({ row }) => row.original.actorName ?? "System",
	},
	{ accessorKey: "action", header: "Action" },
	{ accessorKey: "target", header: "Target" },
	{
		id: "change",
		header: "Before → After",
		cell: ({ row }) => (
			<span className="font-mono text-xs break-all">
				{formatJson(row.original.before)} → {formatJson(row.original.after)}
			</span>
		),
	},
];

export function AccessLogTab() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 20,
	});

	const logQuery = useAccessLogQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		sortBy: "at",
		sortDir: "desc",
	});

	const table = useReactTable({
		data: logQuery.data?.data ?? [],
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		manualSorting: true,
		pageCount: logQuery.data?.meta.totalPages ?? 1,
		onPaginationChange: setPagination,
		state: { pagination },
	});

	return <DataTable table={table} isLoading={logQuery.isLoading} />;
}
