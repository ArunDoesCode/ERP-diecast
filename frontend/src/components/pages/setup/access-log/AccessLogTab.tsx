"use client";

import { type PaginationState, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import {
	listEmptyState,
	listErrorState,
} from "@/components/pages/inventory/list-states";
import { AccessLogDetailDialog } from "@/components/pages/setup/access-log/AccessLogDetailDialog";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { useAccessLogQuery } from "@/lib/api/setup/queries";
import { formatDateTime } from "@/lib/format";
import type { AccessLogEntry } from "@/types/setup";

function buildColumns(
	onOpen: (id: number) => void,
): DataTableColumnDef<AccessLogEntry>[] {
	return [
		{
			id: "at",
			header: "When",
			cell: ({ row }) => formatDateTime(row.original.at),
		},
		{
			id: "actor",
			header: "Who",
			cell: ({ row }) => row.original.actorName ?? "System",
		},
		{ accessorKey: "action", header: "Action" },
		{ accessorKey: "target", header: "Target" },
		{ accessorKey: "summary", header: "Change" },
		{
			id: "open",
			header: () => <span className="sr-only">Open</span>,
			cell: ({ row }) => (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onOpen(row.original.id)}
					aria-label={`Open change ${row.original.id}`}
				>
					Open
				</Button>
			),
		},
	];
}

export function AccessLogTab() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 20,
	});
	const [openId, setOpenId] = useState<number | null>(null);
	const columns = useMemo(() => buildColumns(setOpenId), []);

	const logQuery = useAccessLogQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		sortBy: "at",
		sortDir: "desc",
	});

	const table = useTable({
		features: dataTableFeatures,
		data: logQuery.data?.data ?? [],
		columns,
		manualPagination: true,
		manualSorting: true,
		pageCount: logQuery.data?.meta.totalPages ?? 1,
		onPaginationChange: setPagination,
		state: { pagination },
	});

	return (
		<>
			<DataTable
				hidePagination
				table={table}
				isLoading={logQuery.isLoading}
				emptyState={listEmptyState("No access changes logged yet")}
				errorState={listErrorState(logQuery, "The list could not be loaded.")}
			/>
			<Pagination
				page={pagination.pageIndex + 1}
				pageSize={pagination.pageSize}
				total={logQuery.data?.meta.total ?? 0}
				onPageChange={(next) =>
					setPagination((prev) => ({ ...prev, pageIndex: next - 1 }))
				}
				onPageSizeChange={(size) =>
					setPagination({ pageIndex: 0, pageSize: size })
				}
			/>
			<AccessLogDetailDialog id={openId} onClose={() => setOpenId(null)} />
		</>
	);
}
