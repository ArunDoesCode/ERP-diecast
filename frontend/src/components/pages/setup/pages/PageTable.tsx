"use client";

import { IconDotsVertical } from "@tabler/icons-react";
import {
	type ColumnDef,
	getCoreRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	useDeletePageMutation,
	useModulesQuery,
	usePagesQuery,
} from "@/lib/api/setup/queries";
import type { Page, PageSortField } from "@/types/setup";

type PageTableProps = {
	onEditPage: (page: Page) => void;
};

export function PageTable({ onEditPage }: PageTableProps) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([]);

	const sortColumn = sorting[0];

	const pagesQuery = usePagesQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		sortBy: sortColumn?.id as PageSortField | undefined,
		sortDir: sortColumn?.desc ? "desc" : "asc",
	});
	const modulesQuery = useModulesQuery();
	const deletePageMutation = useDeletePageMutation();
	const [pageToDelete, setPageToDelete] = useState<Page | null>(null);

	const pages = pagesQuery.data?.data ?? [];
	const meta = pagesQuery.data?.meta;
	const modules = modulesQuery.data?.data ?? [];

	const columns = useMemo<ColumnDef<Page>[]>(() => {
		function resolveModuleName(moduleId: number | null) {
			if (moduleId === null) return "—";
			return modules.find((module) => module.id === moduleId)?.name ?? "—";
		}

		return [
			{
				accessorKey: "label",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Label" />
				),
			},
			{
				accessorKey: "path",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Path" />
				),
			},
			{
				id: "moduleId",
				accessorFn: (row) => resolveModuleName(row.moduleId),
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Module" />
				),
			},
			{
				accessorKey: "sortOrder",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Sort Order" />
				),
			},
			{
				id: "actions",
				header: "",
				enableSorting: false,
				enableHiding: false,
				cell: ({ row }) => {
					const page = row.original;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm">
									<IconDotsVertical />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => onEditPage(page)}>
									Edit
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => setPageToDelete(page)}
								>
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		];
	}, [modules, onEditPage]);

	const table = useReactTable({
		data: pages,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualSorting: true,
		manualPagination: true,
		pageCount: meta?.totalPages ?? 1,
		onSortingChange: (updater) => {
			setSorting(updater);
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		onPaginationChange: setPagination,
		state: { sorting, pagination },
	});

	return (
		<>
			<DataTable table={table} isLoading={pagesQuery.isLoading} />

			<ConfirmDeleteDialog
				open={pageToDelete !== null}
				onOpenChange={(open) => {
					if (!open) setPageToDelete(null);
				}}
				onConfirm={() => {
					if (!pageToDelete) return;
					deletePageMutation.mutate(pageToDelete.id, {
						onSuccess: () => setPageToDelete(null),
					});
				}}
				isPending={deletePageMutation.isPending}
				title="Delete page"
				description={`This will permanently delete ${
					pageToDelete?.label ?? "this page"
				}.`}
			/>
		</>
	);
}
