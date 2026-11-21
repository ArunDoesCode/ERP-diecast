"use client";

import { IconFileOff } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
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
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ST_TABS,
	useTransferControls,
} from "@/components/views/stock-transfers/use-transfer-controls";
import { useCan } from "@/hooks/use-can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useItemsQuery, useLocationsQuery } from "@/lib/api/asset/queries";
import {
	stErrorMessage,
	useStockTransfersQuery,
} from "@/lib/api/stock-transfer/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import type { StListRow } from "@/types/stock-transfer";

const columns: DataTableColumnDef<StListRow>[] = [
	{
		accessorKey: "transferNumber",
		header: "Transfer no.",
		cell: ({ row }) => (
			<Link
				href={`/inventory/stock-transfers/${row.original.id}`}
				className="font-mono text-brand-accent hover:underline"
			>
				{row.original.transferNumber}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge doc="st" status={row.original.status} />,
	},
	{ accessorKey: "sourceName", header: "From" },
	{ accessorKey: "destinationName", header: "To" },
	{
		accessorKey: "lineCount",
		header: "Lines",
		meta: { numeric: true },
	},
	{
		accessorKey: "createdAt",
		header: "Date",
		// Below 1100 px the Posted on column is hidden; its time sits under the date.
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span>{formatDate(row.original.createdAt)}</span>
				{row.original.postedAt ? (
					<span className="text-[13px] text-muted-foreground min-[1100px]:hidden">
						Posted {formatDateTime(row.original.postedAt)}
					</span>
				) : null}
			</div>
		),
	},
	{
		accessorKey: "postedAt",
		header: "Posted on",
		meta: { hideBelow1100: true },
		cell: ({ row }) => formatDateTime(row.original.postedAt),
	},
];

function ItemFilter({
	value,
	onChange,
}: {
	value: number | null;
	onChange: (itemId: number | null) => void;
}) {
	const [search, setSearch] = useState("");
	const [pickedLabel, setPickedLabel] = useState("");
	const debounced = useDebouncedValue(search, 300);
	const query = useItemsQuery({
		page: 1,
		pageSize: 20,
		q: debounced.trim() || undefined,
	});
	const options = useMemo(() => {
		const found: SearchableSelectOption[] = [
			{ value: "all", label: "All items" },
			...(query.data?.data ?? []).map((item) => ({
				value: String(item.id),
				label: `${item.sku} · ${item.name}`,
				secondaryLabel: item.uom,
			})),
		];
		if (value && !found.some((o) => o.value === String(value))) {
			found.push({
				value: String(value),
				label: pickedLabel || `Item #${value}`,
			});
		}
		return found;
	}, [query.data, value, pickedLabel]);
	return (
		<SearchableSelect
			value={value ? String(value) : "all"}
			options={options}
			onValueChange={(next) => {
				if (next === "all") {
					onChange(null);
					return;
				}
				setPickedLabel(options.find((o) => o.value === next)?.label ?? "");
				onChange(Number(next));
			}}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder="Item"
			searchPlaceholder="Type SKU or name"
			isLoading={query.isFetching && !query.data}
			className="w-32 min-w-0 [&>span]:truncate"
		/>
	);
}

export function StockTransferListView() {
	const canView = useCan("inventory.view");
	const canManage = useCan("stock_transfer.manage");
	const controls = useTransferControls();

	const query = useStockTransfersQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			status: controls.statusParam,
			sourceLocationId: controls.fromId ?? undefined,
			destinationLocationId: controls.toId ?? undefined,
			itemId: controls.itemId ?? undefined,
			fromDate: controls.dateFrom ?? undefined,
			toDate: controls.dateTo ?? undefined,
		},
		canView && controls.rangeOk,
	);
	const locations = useLocationsQuery({
		page: 1,
		pageSize: 100,
	});

	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	if (!canView) {
		return <NoAccessState what="stock transfers" />;
	}

	const total = query.data?.meta.total ?? 0;
	const filtered = controls.filtersActive || controls.tab !== "all";

	const newButton = canManage ? (
		<Button type="button" size="sm" asChild>
			<Link href="/inventory/stock-transfers/new">New transfer</Link>
		</Button>
	) : undefined;
	const resetButton = (
		<Button type="button" variant="outline" size="sm" onClick={controls.reset}>
			Reset filters
		</Button>
	);

	const locationSelect = (
		label: string,
		value: number | null,
		onChange: (id: number | null) => void,
	) => (
		<Select
			value={value === null ? "all" : String(value)}
			onValueChange={(next) => onChange(next === "all" ? null : Number(next))}
		>
			<SelectTrigger className="w-30" aria-label={label}>
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">
					All {label === "From" ? "sources" : "destinations"}
				</SelectItem>
				{(locations.data?.data ?? []).map((location) => (
					<SelectItem key={location.id} value={String(location.id)}>
						{location.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Stock transfers"
				description="Stock moved between locations, and what still waits to be posted."
				actions={newButton}
			/>

			<FilterBar
				quick={ST_TABS.map((entry) => ({ ...entry, count: null }))}
				value={controls.tab}
				onChange={controls.onTabChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				{locationSelect("From", controls.fromId, controls.onFromChange)}
				{locationSelect("To", controls.toId, controls.onToChange)}
				<ItemFilter value={controls.itemId} onChange={controls.onItemChange} />
				<div className="flex items-center gap-2">
					<Label htmlFor="st-date-from" className="text-muted-foreground">
						Date
					</Label>
					<Input
						id="st-date-from"
						type="date"
						value={controls.dateFrom ?? ""}
						max={controls.dateTo ?? undefined}
						onChange={(event) => controls.onDateFromChange(event.target.value)}
						className="w-32"
					/>
					<Label htmlFor="st-date-to" className="text-muted-foreground">
						to
					</Label>
					<Input
						id="st-date-to"
						type="date"
						value={controls.dateTo ?? ""}
						min={controls.dateFrom ?? undefined}
						onChange={(event) => controls.onDateToChange(event.target.value)}
						className="w-32"
					/>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={query.isLoading}
				hidePagination
				emptyState={
					filtered ? (
						<EmptyState
							icon={IconFileOff}
							title="Nothing matches these filters"
							action={resetButton}
						/>
					) : (
						<EmptyState
							icon={IconFileOff}
							title="No stock transfers yet"
							action={newButton}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={stErrorMessage(
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
