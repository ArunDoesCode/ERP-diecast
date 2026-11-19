"use client";

import { IconBuildingStore, IconPlus, IconSearch } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { CreateSupplierModal } from "@/components/pages/suppliers/CreateSupplierModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/hooks/use-can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useSupplierLookupQuery,
	useSuppliersQuery,
} from "@/lib/api/suppliers/queries";
import type {
	Supplier,
	SupplierSortField,
	SupplierStatusFilter,
} from "@/types/suppliers";

const columns: DataTableColumnDef<Supplier>[] = [
	{
		accessorKey: "name",
		header: "Supplier",
		cell: ({ row }) => (
			<span className="inline-flex items-center gap-2">
				<Link
					href={`/suppliers/${row.original.id}`}
					className="text-brand-accent hover:underline"
				>
					{row.original.name}
				</Link>
				{row.original.isActive ? null : (
					<StatusBadge doc="supplier" status="inactive" />
				)}
			</span>
		),
	},
	{
		accessorKey: "contactPerson",
		header: "Contact",
		cell: ({ row }) => row.original.contactPerson || "–",
	},
	{
		accessorKey: "phone",
		header: "Phone",
		cell: ({ row }) => row.original.phone || "–",
	},
	{
		accessorKey: "email",
		header: "Email",
		cell: ({ row }) => row.original.email || "–",
	},
];

const STATUS_QUICK: Array<{ key: SupplierStatusFilter; label: string }> = [
	{ key: "all", label: "All" },
	{ key: "active", label: "Active" },
	{ key: "inactive", label: "Inactive" },
];

const SORT_FIELDS: Array<{ label: string; value: SupplierSortField }> = [
	{ label: "Name", value: "name" },
	{ label: "Type", value: "type" },
	{ label: "Contact person", value: "contactPerson" },
	{ label: "Status", value: "isActive" },
	{ label: "Created", value: "createdAt" },
];

export function SuppliersView() {
	const router = useRouter();
	const canManage = useCan("supplier.manage");

	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [search, setSearch] = useState("");
	const [comboboxSearch, setComboboxSearch] = useState("");
	const [sortBy, setSortBy] = useState<SupplierSortField>("name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [status, setStatus] = useState<SupplierStatusFilter>("all");
	const [createOpen, setCreateOpen] = useState(false);

	const debouncedSearch = useDebouncedValue(search, 400);
	const supplierLookupQuery = useSupplierLookupQuery(comboboxSearch, 10);

	const suppliersQuery = useSuppliersQuery({
		page,
		pageSize,
		q: debouncedSearch,
		status,
		sortBy,
		sortDir,
	});

	const suppliers = suppliersQuery.data?.data ?? [];
	const meta = suppliersQuery.data?.meta;
	const supplierLookupOptions = useMemo(() => {
		const raw =
			supplierLookupQuery.data?.pages.flatMap((queryPage) =>
				queryPage.data.map<SearchableSelectOption>((supplier) => ({
					value: String(supplier.id),
					label: supplier.name,
					secondaryLabel:
						supplier.contactPerson || supplier.email || "No contact",
				})),
			) ?? [];

		const dedup = new Map<string, SearchableSelectOption>();
		for (const option of raw) dedup.set(option.value, option);
		return Array.from(dedup.values());
	}, [supplierLookupQuery.data]);

	const table = useTable({
		features: dataTableFeatures,
		data: suppliers,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	const filtersActive = status !== "all" || search !== "";
	const resetFilters = () => {
		setStatus("all");
		setSearch("");
		setPage(1);
	};

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Suppliers"
				description="Vendors you buy from or send job work to."
				actions={
					canManage ? (
						<Button onClick={() => setCreateOpen(true)}>
							<IconPlus />
							Create supplier
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				quick={STATUS_QUICK}
				value={status}
				onChange={(key) => {
					setStatus(key as SupplierStatusFilter);
					setPage(1);
				}}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<div className="w-56">
					<SearchableSelect
						value={undefined}
						options={supplierLookupOptions}
						onValueChange={(value) => router.push(`/suppliers/${value}`)}
						searchValue={comboboxSearch}
						onSearchChange={setComboboxSearch}
						placeholder="Jump to supplier"
						searchPlaceholder="Search supplier"
						emptyText="Type to search suppliers"
						isLoading={supplierLookupQuery.isLoading}
						hasNextPage={supplierLookupQuery.hasNextPage}
						isFetchingNextPage={supplierLookupQuery.isFetchingNextPage}
						onReachEnd={() => supplierLookupQuery.fetchNextPage()}
					/>
				</div>

				<div className="relative w-72">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							setPage(1);
						}}
						placeholder="Search name, contact, GSTIN or item SKU"
						aria-label="Search suppliers"
						className="pl-7"
					/>
				</div>

				<Select
					value={sortBy}
					onValueChange={(value) => {
						setSortBy(value as SupplierSortField);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-40" aria-label="Sort by">
						<SelectValue placeholder="Sort by" />
					</SelectTrigger>
					<SelectContent>
						{SORT_FIELDS.map((field) => (
							<SelectItem key={field.value} value={field.value}>
								{field.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={sortDir}
					onValueChange={(value) => {
						setSortDir(value as "asc" | "desc");
						setPage(1);
					}}
				>
					<SelectTrigger className="w-28" aria-label="Order">
						<SelectValue placeholder="Order" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="asc">Asc</SelectItem>
						<SelectItem value="desc">Desc</SelectItem>
					</SelectContent>
				</Select>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={suppliersQuery.isLoading}
				hidePagination
				emptyState={
					filtersActive ? (
						<EmptyState
							icon={IconBuildingStore}
							title="Nothing matches these filters"
							action={
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={resetFilters}
								>
									Reset filters
								</Button>
							}
						/>
					) : (
						<EmptyState
							icon={IconBuildingStore}
							title="No suppliers yet"
							action={
								canManage ? (
									<Button size="sm" onClick={() => setCreateOpen(true)}>
										Create supplier
									</Button>
								) : undefined
							}
						/>
					)
				}
				errorState={
					suppliersQuery.isError ? (
						<ErrorState
							message="Failed to load suppliers."
							onRetry={() => {
								void suppliersQuery.refetch();
							}}
							retrying={suppliersQuery.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={page}
				pageSize={pageSize}
				total={meta?.total ?? 0}
				onPageChange={setPage}
				onPageSizeChange={(nextPageSize) => {
					setPageSize(nextPageSize);
					setPage(1);
				}}
			/>

			<CreateSupplierModal open={createOpen} onOpenChange={setCreateOpen} />
		</div>
	);
}
