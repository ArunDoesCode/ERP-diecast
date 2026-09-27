"use client";

import { IconPlus } from "@tabler/icons-react";
import {
	type ColumnDef,
	getCoreRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

	const columns = useMemo<ColumnDef<ApprovalPolicySummary>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Policy" />
				),
				cell: ({ row }) => (
					<button
						type="button"
						onClick={() => onEdit(row.original.id)}
						className="text-left font-medium text-primary hover:underline"
					>
						{row.original.name}
					</button>
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
				cell: ({ row }) =>
					row.original.isActive ? (
						<Badge variant="default">Active</Badge>
					) : (
						<Badge variant="secondary">Inactive</Badge>
					),
			},
		],
		[onEdit], // Fixed dependency array
	);

	const table = useReactTable({
		data: policies,
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
		<Card>
			<CardHeader className="gap-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle>Approval Policies</CardTitle>
					<Button type="button" onClick={onCreate}>
						<IconPlus className="size-3.5" />
						Create Policy
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Server-side search, filter, sorting, and pagination.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<Input
						id="approval-policy-search"
						placeholder="Search policy"
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
						<SelectTrigger className="w-full">
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
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All statuses</SelectItem>
							<SelectItem value="active">Active only</SelectItem>
							<SelectItem value="inactive">Inactive only</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<DataTable table={table} isLoading={policiesQuery.isLoading} />
			</CardContent>
		</Card>
	);
}
