"use client";

import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSupplierServicesQuery } from "@/lib/api/suppliers/queries";
import type { SupplierService } from "@/types/suppliers";

function toCurrencyFromPaise(value: number) {
	return (value / 100).toLocaleString(undefined, {
		style: "currency",
		currency: "INR",
	});
}

export function SupplierServicesOfferingsPane({
	supplierId,
	active,
	search,
	page,
	pageSize,
	onPageChange,
	onEdit,
	canManage,
}: {
	supplierId: number;
	active: boolean;
	search: string;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onEdit: (service: SupplierService) => void;
	canManage: boolean;
}) {
	const serviceQuery = useSupplierServicesQuery(
		supplierId,
		{
			page,
			pageSize,
			q: search || undefined,
		},
		active,
	);

	const serviceRows = serviceQuery.data?.data ?? [];
	const serviceMeta = serviceQuery.data?.meta;

	const columns = useMemo<ColumnDef<SupplierService>[]>(
		() => [
			{
				accessorKey: "serviceName",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Service" />
				),
				cell: ({ row }) => {
					const label = <span>{row.original.serviceName}</span>;
					if (!canManage) return label;
					return (
						<Button
							type="button"
							variant="link"
							className="h-auto p-0"
							onClick={() => onEdit(row.original)}
						>
							{label}
						</Button>
					);
				},
			},
			{
				accessorKey: "serviceUnitPricePaise",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Rate" />
				),
				cell: ({ row }) =>
					toCurrencyFromPaise(row.original.serviceUnitPricePaise),
			},
			{
				accessorKey: "taxPercentage",
				header: "Tax %",
				cell: ({ row }) => row.original.taxPercentage ?? "N/A",
			},
			{
				accessorKey: "leadTimeDays",
				header: "Lead days",
				cell: ({ row }) => row.original.leadTimeDays ?? "N/A",
			},
			{
				accessorKey: "isActive",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={row.original.isActive ? "default" : "outline"}>
						{row.original.isActive ? "Active" : "Inactive"}
					</Badge>
				),
			},
		],
		[onEdit, canManage],
	);

	const pagination = useMemo<PaginationState>(
		() => ({
			pageIndex: (serviceMeta?.page ?? page) - 1,
			pageSize: serviceMeta?.pageSize ?? pageSize,
		}),
		[serviceMeta?.page, serviceMeta?.pageSize, page, pageSize],
	);

	const table = useReactTable({
		data: serviceRows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		pageCount: serviceMeta?.totalPages ?? 1,
		onPaginationChange: (updater) => {
			const current = {
				pageIndex: pagination.pageIndex,
				pageSize: pagination.pageSize,
			};
			const next = typeof updater === "function" ? updater(current) : updater;
			if (next.pageIndex !== current.pageIndex) {
				onPageChange(next.pageIndex + 1);
			}
		},
		state: { pagination },
	});

	if (serviceQuery.isError) {
		return (
			<div className="rounded-md border p-4">
				<p className="text-sm text-destructive">
					Failed to load supplier service offerings.
				</p>
				<Button
					type="button"
					variant="outline"
					className="mt-3"
					onClick={() => serviceQuery.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<DataTable
			table={table}
			isLoading={serviceQuery.isLoading}
			rowClassName={(row) => (row.isActive ? undefined : "opacity-50")}
		/>
	);
}
