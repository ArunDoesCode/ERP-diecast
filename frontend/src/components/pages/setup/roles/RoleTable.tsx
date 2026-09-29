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
import { RoleCopyDialog } from "@/components/pages/setup/roles/RoleCopyDialog";
import { RoleGrantsEditor } from "@/components/pages/setup/roles/RoleGrantsEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteRoleMutation, useRolesQuery } from "@/lib/api/setup/queries";
import type { Role, RoleSortField } from "@/types/setup";

type RoleTableProps = {
	onEditRole: (role: Role) => void;
};

export function RoleTable({ onEditRole }: RoleTableProps) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([]);

	const sortColumn = sorting[0];

	const rolesQuery = useRolesQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		sortBy: sortColumn?.id as RoleSortField | undefined,
		sortDir: sortColumn?.desc ? "desc" : "asc",
	});
	const deleteRoleMutation = useDeleteRoleMutation();
	const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
	const [roleToCopy, setRoleToCopy] = useState<Role | null>(null);
	const [grantsRoleId, setGrantsRoleId] = useState<number | null>(null);

	const roles = rolesQuery.data?.data ?? [];
	const meta = rolesQuery.data?.meta;

	const columns = useMemo<ColumnDef<Role>[]>(() => {
		return [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Name" />
				),
				cell: ({ row }) => (
					<span className="flex items-center gap-2">
						{row.original.name}
						{row.original.isSystem && (
							<Badge variant="secondary">System (locked)</Badge>
						)}
					</span>
				),
			},
			{
				id: "keyCount",
				header: "Permissions",
				cell: ({ row }) =>
					row.original.isSuperAdmin
						? "All access"
						: (row.original.keyCount ?? 0),
				// backend only sorts roles by "name"
				enableSorting: false,
			},
			{
				id: "employeeCount",
				header: "Employees",
				cell: ({ row }) => row.original.employeeCount ?? 0,
				enableSorting: false,
			},
			{
				id: "actions",
				header: "",
				enableSorting: false,
				enableHiding: false,
				cell: ({ row }) => {
					const role = row.original;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm">
									<IconDotsVertical />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{!role.isSuperAdmin && (
									<DropdownMenuItem onSelect={() => setGrantsRoleId(role.id)}>
										Edit access
									</DropdownMenuItem>
								)}
								{!role.isSystem && (
									<DropdownMenuItem onSelect={() => onEditRole(role)}>
										Rename
									</DropdownMenuItem>
								)}
								{!role.isSuperAdmin && (
									<DropdownMenuItem onSelect={() => setRoleToCopy(role)}>
										Copy
									</DropdownMenuItem>
								)}
								{!role.isSystem && (
									<DropdownMenuItem
										variant="destructive"
										onSelect={() => setRoleToDelete(role)}
									>
										Delete
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		];
	}, [onEditRole]);

	const table = useReactTable({
		data: roles,
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
			<DataTable table={table} isLoading={rolesQuery.isLoading} />

			<RoleGrantsEditor
				roleId={grantsRoleId}
				onClose={() => setGrantsRoleId(null)}
			/>
			<RoleCopyDialog role={roleToCopy} onClose={() => setRoleToCopy(null)} />

			<ConfirmDeleteDialog
				open={roleToDelete !== null}
				onOpenChange={(open) => {
					if (!open) setRoleToDelete(null);
				}}
				onConfirm={() => {
					if (!roleToDelete) return;
					deleteRoleMutation.mutate(roleToDelete.id, {
						onSuccess: () => setRoleToDelete(null),
					});
				}}
				isPending={deleteRoleMutation.isPending}
				title="Delete role"
				description={`This will permanently delete ${
					roleToDelete?.name ?? "this role"
				}.`}
			/>
		</>
	);
}
