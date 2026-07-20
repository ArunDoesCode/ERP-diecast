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
  useDeleteEmployeeMutation,
  useEmployeesQuery,
  useRolesQuery,
} from "@/lib/api/setup/queries";
import type { Employee, EmployeeSortField } from "@/types/setup";

type EmployeeTableProps = {
  onEditEmployee: (employee: Employee) => void;
};

export function EmployeeTable({ onEditEmployee }: EmployeeTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  const sortColumn = sorting[0];

  const employeesQuery = useEmployeesQuery({
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    sortBy: sortColumn?.id as EmployeeSortField | undefined,
    sortDir: sortColumn?.desc ? "desc" : "asc",
  });
  const rolesQuery = useRolesQuery();
  const deleteEmployeeMutation = useDeleteEmployeeMutation();
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(
    null,
  );

  const employees = employeesQuery.data?.data ?? [];
  const meta = employeesQuery.data?.meta;
  const roles = rolesQuery.data?.data ?? [];

  const columns = useMemo<ColumnDef<Employee>[]>(() => {
    function resolveRoleName(roleId: number) {
      return roles.find((role) => role.id === roleId)?.name ?? "—";
    }

    return [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
      },
      {
        id: "roleId",
        accessorFn: (row) => resolveRoleName(row.roleId),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Role" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {resolveRoleName(row.original.roleId)}
          </Badge>
        ),
      },
      {
        accessorKey: "dailyRatePaise",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Daily Rate" />
        ),
        cell: ({ getValue }) =>
          (getValue<number>() / 100).toLocaleString(undefined, {
            style: "currency",
            currency: "INR",
          }),
      },
      {
        accessorKey: "isActive",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ getValue }) => (
          <Badge variant={getValue<boolean>() ? "default" : "outline"}>
            {getValue<boolean>() ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <IconDotsVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEditEmployee(employee)}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setEmployeeToDelete(employee)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ];
  }, [roles, onEditEmployee]);

  const table = useReactTable({
    data: employees,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: meta?.totalPages ?? 1,
    onSortingChange: (updater) => {
      setSorting(updater);
      // sort changed — first page of the new order, not wherever we were before
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    state: { sorting, pagination },
  });

  return (
    <>
      <DataTable table={table} isLoading={employeesQuery.isLoading} />

      <ConfirmDeleteDialog
        open={employeeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setEmployeeToDelete(null);
        }}
        onConfirm={() => {
          if (!employeeToDelete) return;
          deleteEmployeeMutation.mutate(employeeToDelete.id, {
            onSuccess: () => setEmployeeToDelete(null),
          });
        }}
        isPending={deleteEmployeeMutation.isPending}
        title="Delete employee"
        description={`This will permanently delete ${
          employeeToDelete?.name ?? "this employee"
        }.`}
      />
    </>
  );
}
