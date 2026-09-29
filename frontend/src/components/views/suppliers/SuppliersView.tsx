"use client";

import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { CreateSupplierModal } from "@/components/pages/suppliers/CreateSupplierModal";
import { SuppliersCards } from "@/components/pages/suppliers/SuppliersCards";
import { SuppliersPagination } from "@/components/pages/suppliers/SuppliersPagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { canManageSuppliers } from "@/lib/api/suppliers/permissions";
import {
	useSupplierLookupQuery,
	useSuppliersQuery,
} from "@/lib/api/suppliers/queries";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type {
	SupplierSortField,
	SupplierStatusFilter,
} from "@/types/suppliers";

const SORT_FIELDS: Array<{ label: string; value: SupplierSortField }> = [
	{ label: "Name", value: "name" },
	{ label: "Type", value: "type" },
	{ label: "Contact person", value: "contactPerson" },
	{ label: "Status", value: "isActive" },
	{ label: "Created", value: "createdAt" },
];

export function SuppliersView() {
	const router = useRouter();
	const canManage = canManageSuppliers(
		useAuthSessionStore((state) => state.role),
	);

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

	if (suppliersQuery.isError) {
		return (
			<div className="flex w-full flex-col gap-4 p-6">
				<p className="text-sm text-destructive">Failed to load suppliers.</p>
				<Button
					type="button"
					variant="outline"
					className="w-fit"
					onClick={() => suppliersQuery.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<div className="w-full sm:max-w-sm">
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

					<div className="relative flex-1">
						<IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
							}}
							placeholder="Search name, contact, email, phone, GSTIN or item SKU"
							aria-label="Search suppliers"
							className="pl-7"
						/>
					</div>

					<div className="flex items-center gap-2">
						<Select
							value={status}
							onValueChange={(value) => {
								setStatus(value as SupplierStatusFilter);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-32" aria-label="Filter by status">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All</SelectItem>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
							</SelectContent>
						</Select>

						<Select
							value={sortBy}
							onValueChange={(value) => {
								setSortBy(value as SupplierSortField);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-40">
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
							<SelectTrigger className="w-32">
								<SelectValue placeholder="Order" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="asc">Asc</SelectItem>
								<SelectItem value="desc">Desc</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				{canManage ? (
					<Button onClick={() => setCreateOpen(true)}>
						<IconPlus className="size-3.5" />
						Create supplier
					</Button>
				) : null}
			</div>

			<SuppliersCards
				suppliers={suppliers}
				isLoading={suppliersQuery.isLoading}
			/>

			<SuppliersPagination
				page={page}
				pageSize={pageSize}
				meta={meta}
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
