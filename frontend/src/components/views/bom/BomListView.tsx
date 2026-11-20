"use client";

import { IconFileOff, IconPlus, IconSearch } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
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
import {
	BOM_STATUS_QUICK,
	useBomControls,
} from "@/components/views/bom/use-bom-controls";
import { useCan } from "@/hooks/use-can";
import { useBomsQuery } from "@/lib/api/bom/queries";
import { formatDate } from "@/lib/format";
import {
	type BomKind,
	type BomListRow,
	bomKindLabels,
	bomKindValues,
} from "@/types/bom";

const columns: DataTableColumnDef<BomListRow>[] = [
	{
		accessorKey: "number",
		header: "BOM no.",
		cell: ({ row }) => (
			<Link
				href={`/bom/part/${row.original.partId}?rev=${row.original.revision}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.number}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="bom" status={row.original.status} />,
	},
	{
		id: "part",
		header: "Part",
		cell: ({ row }) => (
			<span>
				{row.original.partSku}{" "}
				<span className="text-muted-foreground">{row.original.partName}</span>
			</span>
		),
	},
	{
		accessorKey: "kind",
		header: "Kind",
		cell: ({ row }) => bomKindLabels[row.original.kind],
	},
	{
		accessorKey: "releasedAt",
		header: "Released",
		cell: ({ row }) => formatDate(row.original.releasedAt),
	},
];

export function BomListView() {
	const canManage = useCan("bom.manage");
	const controls = useBomControls();
	const query = useBomsQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		status: controls.statusParam,
		kind: controls.kind ?? undefined,
		q: controls.q,
	});

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
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
				title="Bills of materials"
				description="What goes into each part: casting, job work or assembly."
				actions={
					canManage ? (
						<Button type="button" size="sm" asChild>
							<Link href="/bom/new">
								<IconPlus />
								Create BOM
							</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				quick={BOM_STATUS_QUICK.map((entry) => ({ ...entry }))}
				value={controls.status}
				onChange={controls.onStatusChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<Select
					value={controls.kind ?? "all"}
					onValueChange={(value) =>
						controls.onKindChange(value as "all" | BomKind)
					}
				>
					<SelectTrigger className="w-40" aria-label="Kind">
						<SelectValue placeholder="Kind" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All kinds</SelectItem>
						{bomKindValues.map((kind) => (
							<SelectItem key={kind} value={kind}>
								{bomKindLabels[kind]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="relative w-64">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={controls.searchInput}
						onChange={(event) => controls.onSearchChange(event.target.value)}
						placeholder="Search part SKU or name"
						aria-label="Search part SKU or name"
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
							title="No BOMs yet"
							action={
								canManage ? (
									<Button type="button" size="sm" asChild>
										<Link href="/bom/new">Create BOM</Link>
									</Button>
								) : undefined
							}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={
								query.error instanceof Error
									? query.error.message
									: "The list could not be loaded."
							}
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
		</div>
	);
}
