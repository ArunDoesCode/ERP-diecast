"use client";

import { IconFileOff, IconSearch } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { ContractItemPicker } from "@/components/pages/rate-contracts/ContractItemPicker";
import { SupplierFilter } from "@/components/pages/rfq/SupplierPicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	CONTRACT_TABS,
	useContractControls,
} from "@/components/views/rate-contracts/use-contract-controls";
import { useCan } from "@/hooks/use-can";
import {
	contractErrorMessage,
	useContractsQuery,
} from "@/lib/api/rate-contract/queries";
import { formatDate } from "@/lib/format";
import type { ContractListRow } from "@/types/rate-contract";

const ENDS_WITHIN_DAYS = 30;

const columns: DataTableColumnDef<ContractListRow>[] = [
	{
		accessorKey: "contractNumber",
		header: "RC no.",
		cell: ({ row }) => (
			<Link
				href={`/rate-contracts/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.contractNumber}
			</Link>
		),
	},
	{
		accessorKey: "effectiveStatus",
		header: "Status",
		cell: ({ row }) => (
			<StatusBadge doc="contract" status={row.original.effectiveStatus} />
		),
	},
	{
		id: "supplier",
		header: "Supplier",
		cell: ({ row }) => (
			<span>
				{row.original.supplierName}
				<span className="block text-[13px] text-muted-foreground">
					{row.original.itemCount}{" "}
					{row.original.itemCount === 1 ? "item" : "items"} · by{" "}
					{row.original.createdByName ?? "-"}
				</span>
			</span>
		),
	},
	{
		id: "valid",
		header: "Valid",
		cell: ({ row }) =>
			`${formatDate(row.original.validFrom)} – ${formatDate(row.original.validTo)}`,
	},
	{
		accessorKey: "orderedPercent",
		header: "Ordered",
		meta: { numeric: true },
		cell: ({ row }) =>
			row.original.orderedPercent === null
				? "–"
				: `${row.original.orderedPercent} %`,
	},
];

export function RateContractListView() {
	const canView = useCan("contract.view");
	const canManage = useCan("contract.manage");
	const controls = useContractControls();

	const query = useContractsQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			status:
				controls.tab === "all" || controls.tab === "ending"
					? undefined
					: controls.tab,
			endsWithinDays: controls.tab === "ending" ? ENDS_WITHIN_DAYS : undefined,
			supplierId: controls.supplierId,
			itemId: controls.itemId,
			q: controls.q,
		},
		canView,
	);
	const rows = useMemo(() => query.data?.data ?? [], [query.data]);

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	if (!canView) {
		return <NoAccessState what="rate contracts" />;
	}

	const total = query.data?.meta.total ?? 0;
	const newButton = canManage ? (
		<Button type="button" asChild>
			<Link href="/rate-contracts/new">New contract</Link>
		</Button>
	) : undefined;

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Rate contracts"
				description="Prices agreed with a supplier for a period."
				actions={newButton}
			/>

			<FilterBar
				quick={CONTRACT_TABS.map((entry) => ({ ...entry }))}
				value={controls.tab}
				onChange={controls.onTabChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<SupplierFilter
					value={controls.supplierId}
					onChange={controls.onSupplierChange}
				/>
				<div className="w-56">
					<ContractItemPicker
						value={controls.itemId}
						onChange={(item) => controls.onItemChange(item.id)}
					/>
				</div>
				<div className="relative w-56">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						maxLength={100}
						placeholder="Search contract no."
						aria-label="Search contracts"
						className="pl-7"
					/>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					controls.filtersActive || controls.tab !== "all" ? (
						<EmptyState
							icon={IconFileOff}
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
							icon={IconFileOff}
							title="No rate contracts yet."
							action={newButton}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={contractErrorMessage(
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
				total={total}
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>
		</div>
	);
}
