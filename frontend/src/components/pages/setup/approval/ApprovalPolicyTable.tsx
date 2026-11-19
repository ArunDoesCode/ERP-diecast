"use client";

import { IconListDetails, IconPlus } from "@tabler/icons-react";
import {
	type PaginationState,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
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
import { useApprovalPoliciesQuery } from "@/lib/api/approval/queries";
import type {
	ApprovalDocType,
	ApprovalPolicySortField,
	ApprovalPolicySummary,
} from "@/types/approval";
import { type ActiveFilter, toAmountLabel } from "./approval-policy-helpers";

type ApprovalPolicyTableProps = {
	onCreate: () => void;
	onEdit: (policyId: number) => void;
};

export function ApprovalPolicyTable({
	onCreate,
	onEdit,
}: ApprovalPolicyTableProps) {
	const canManage = useCan("approval.policy.manage");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "priority", desc: true },
	]);
	const [search, setSearch] = useState("");
	const [docType, setDocType] = useState<"all" | ApprovalDocType>("all");
	const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

	const debouncedSearch = useDebouncedValue(search, 400);
	const sortColumn = sorting[0];

	const policiesQuery = useApprovalPoliciesQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		sortBy:
			(sortColumn?.id as ApprovalPolicySortField | undefined) ?? "priority",
		sortDir: sortColumn?.desc ? "desc" : "asc",
		docType: docType === "all" ? undefined : docType,
		isActive: activeFilter === "all" ? undefined : activeFilter === "active",
		q: debouncedSearch.trim() || undefined,
	});

	const policies = policiesQuery.data?.data ?? [];
	const meta = policiesQuery.data?.meta;

	const columns = useMemo<DataTableColumnDef<ApprovalPolicySummary>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Policy" />
				),
				cell: ({ row }) =>
					canManage ? (
						<button
							type="button"
							onClick={() => onEdit(row.original.id)}
							className="text-left font-medium text-brand-accent hover:underline"
						>
							{row.original.name}
						</button>
					) : (
						<span className="font-medium">{row.original.name}</span>
					),
			},
			{
				accessorKey: "docType",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Doc Type" />
				),
				cell: ({ row }) => row.original.docType.toUpperCase(),
			},
			{
				accessorKey: "priority",
				meta: { numeric: true },
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Priority" />
				),
			},
			{
				id: "rules",
				header: "Rules",
				enableSorting: false,
				cell: ({ row }) =>
					toAmountLabel(
						row.original.minAmountPaise,
						row.original.maxAmountPaise,
					),
			},
			{
				id: "chain",
				header: "Chain",
				enableSorting: false,
				cell: ({ row }) => {
					if (row.original.autoApprove) return "Auto approved";
					const levels = row.original.approvalLevels ?? 0;
					return `${levels} levels`;
				},
			},
			{
				accessorKey: "isActive",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Status" />
				),
				cell: ({ row }) => (
					<StatusBadge
						doc="policy"
						status={row.original.isActive ? "active" : "inactive"}
					/>
				),
			},
		],
		[onEdit, canManage],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: policies,
		columns,
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

	const total = meta?.total ?? 0;
	const filtersActive =
		search.trim() !== "" || docType !== "all" || activeFilter !== "all";

	function resetFilters() {
		setSearch("");
		setDocType("all");
		setActiveFilter("all");
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Approval policies"
				description="Who approves which documents, and in what order."
				actions={
					canManage ? (
						<Button type="button" size="sm" onClick={onCreate}>
							<IconPlus />
							Create policy
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				value="all"
				onChange={() => {}}
				onReset={resetFilters}
				filtersActive={filtersActive}
			>
				<Input
					id="approval-policy-search"
					aria-label="Search policy"
					placeholder="Search policy"
					className="w-52"
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						setPagination((prev) => ({ ...prev, pageIndex: 0 }));
					}}
				/>

				<Select
					value={docType}
					onValueChange={(value) => {
						setDocType(value as "all" | ApprovalDocType);
						setPagination((prev) => ({ ...prev, pageIndex: 0 }));
					}}
				>
					<SelectTrigger className="w-40" aria-label="Doc type">
						<SelectValue placeholder="Doc type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All doc types</SelectItem>
						<SelectItem value="pr">PR</SelectItem>
						<SelectItem value="po">PO</SelectItem>
						<SelectItem value="sco">SCO</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={activeFilter}
					onValueChange={(value) => {
						setActiveFilter(value as ActiveFilter);
						setPagination((prev) => ({ ...prev, pageIndex: 0 }));
					}}
				>
					<SelectTrigger className="w-40" aria-label="Status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						<SelectItem value="active">Active only</SelectItem>
						<SelectItem value="inactive">Inactive only</SelectItem>
					</SelectContent>
				</Select>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={policiesQuery.isLoading}
				hidePagination
				emptyState={
					filtersActive ? (
						<EmptyState
							icon={IconListDetails}
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
							icon={IconListDetails}
							title="No approval policies yet"
						/>
					)
				}
				errorState={
					policiesQuery.isError ? (
						<ErrorState
							message={
								policiesQuery.error instanceof Error
									? policiesQuery.error.message
									: "The policies could not be loaded."
							}
							onRetry={() => {
								void policiesQuery.refetch();
							}}
							retrying={policiesQuery.isRefetching}
						/>
					) : undefined
				}
			/>

			<Pagination
				page={pagination.pageIndex + 1}
				pageSize={pagination.pageSize}
				total={total}
				onPageChange={(next) =>
					setPagination((prev) => ({ ...prev, pageIndex: next - 1 }))
				}
				onPageSizeChange={(size) =>
					setPagination({ pageIndex: 0, pageSize: size })
				}
			/>
		</div>
	);
}
