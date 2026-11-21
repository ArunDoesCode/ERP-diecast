"use client";

import { IconDots, IconPlus, IconSearch, IconUsers } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { CustomerActiveDialog } from "@/components/pages/customers/CustomerActiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	CUSTOMER_STATUS_QUICK,
	useCustomerControls,
} from "@/components/views/customers/use-customer-controls";
import { useCan } from "@/hooks/use-can";
import {
	customerErrorMessage,
	useCustomersQuery,
	useSetCustomerActiveMutation,
} from "@/lib/api/customers/queries";
import { type Customer, stateName } from "@/types/customer";

export function CustomerListView() {
	const canManage = useCan("customer.manage");
	const controls = useCustomerControls();
	const query = useCustomersQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		sortBy: "name",
		sortDir: "asc",
		isActive: controls.isActive,
		q: controls.q,
	});
	const setActive = useSetCustomerActiveMutation();
	const [target, setTarget] = useState<Customer | null>(null);

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const columns = useMemo<DataTableColumnDef<Customer>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				cell: ({ row }) =>
					canManage ? (
						<Link
							href={`/customers/${row.original.id}/edit`}
							className="text-brand-accent hover:underline"
						>
							{row.original.name}
						</Link>
					) : (
						row.original.name
					),
			},
			{
				id: "state",
				header: "State",
				cell: ({ row }) => stateName(row.original.stateCode),
			},
			{
				id: "gstin",
				header: "GSTIN",
				cell: ({ row }) => (
					<span className="font-mono">{row.original.gstin ?? "–"}</span>
				),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<StatusBadge
						doc="customer"
						status={row.original.isActive ? "active" : "inactive"}
					/>
				),
			},
			...(canManage
				? [
						{
							id: "actions",
							header: () => <span className="sr-only">Actions</span>,
							cell: ({ row }) => (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label={`Actions for ${row.original.name}`}
										>
											<IconDots />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onSelect={() => setTarget(row.original)}>
											{row.original.isActive ? "Deactivate" : "Activate"}
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							),
						} satisfies DataTableColumnDef<Customer>,
					]
				: []),
		],
		[canManage],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Customers"
				description="Who we sell to. Pick them on sale orders."
				actions={
					canManage ? (
						<Button type="button" size="sm" asChild>
							<Link href="/customers/new">
								<IconPlus />
								Add customer
							</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				quick={CUSTOMER_STATUS_QUICK.map((entry) => ({ ...entry }))}
				value={controls.status}
				onChange={controls.onStatusChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<div className="relative w-64">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						placeholder="Search name"
						aria-label="Search name"
						className="pl-7"
					/>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					controls.filtersActive ? (
						<EmptyState
							icon={IconUsers}
							title="Nothing matches these filters"
							action={
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={controls.reset}
								>
									Reset filters
								</Button>
							}
						/>
					) : (
						<EmptyState
							icon={IconUsers}
							title="No customers yet"
							action={
								canManage ? (
									<Button type="button" size="sm" asChild>
										<Link href="/customers/new">Add customer</Link>
									</Button>
								) : undefined
							}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={customerErrorMessage(
								query.error,
								"The list could not be loaded.",
							)}
							onRetry={() => {
								void query.refetch();
							}}
							retrying={query.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={controls.page}
				pageSize={controls.pageSize}
				total={query.data?.meta.total ?? 0}
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>

			<CustomerActiveDialog
				open={target !== null}
				onOpenChange={(open) => {
					if (!open) setTarget(null);
				}}
				name={target?.name ?? ""}
				activate={target ? !target.isActive : false}
				isPending={setActive.isPending}
				onConfirm={() => {
					if (!target) return;
					setActive.mutate(
						{ id: target.id, isActive: !target.isActive },
						{ onSuccess: () => setTarget(null) },
					);
				}}
			/>
		</div>
	);
}
