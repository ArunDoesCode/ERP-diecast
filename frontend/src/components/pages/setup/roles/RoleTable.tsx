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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	useDeleteRoleMutation,
	useEmployeesQuery,
	useRolesQuery,
} from "@/lib/api/setup/queries";
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
	const employeesQuery = useEmployeesQuery();
	const deleteRoleMutation = useDeleteRoleMutation();
	const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

	const roles = rolesQuery.data?.data ?? [];
	const meta = rolesQuery.data?.meta;
	const employees = employeesQuery.data?.data ?? [];

	const columns = useMemo<ColumnDef<Role>[]>(() => {
		function countEmployees(roleId: number) {
			return employees.filter((employee) => employee.roleId === roleId).length;
		}

		return [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Name" />
				),
				cell: ({ row }) => (
					<span className="flex items-center gap-2">
						{row.original.name}
						{row.original.isSystem && <Badge variant="secondary">System</Badge>}
					</span>
				),
			},
			{
				id: "employeeCount",
				accessorFn: (row) => countEmployees(row.id),
				header: "Employee Count",
				// backend roleListQuerySchema only supports sorting by "name" — this is a
				// derived/computed column, not sortable server-side.
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
								<DropdownMenuItem onSelect={() => onEditRole(role)}>
									Edit
								</DropdownMenuItem>
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
	}, [employees, onEditRole]);

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
