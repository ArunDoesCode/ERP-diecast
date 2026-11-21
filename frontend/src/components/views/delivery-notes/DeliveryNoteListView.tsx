"use client";

import { IconFileOff } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { SoNumberLink } from "@/components/pages/delivery-notes/DnSidePanels";
import { groupEway } from "@/components/pages/delivery-notes/dn-format";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
	DN_TABS,
	useDnControls,
} from "@/components/views/delivery-notes/use-dn-controls";
import { useCan } from "@/hooks/use-can";
import {
	dnErrorMessage,
	useDeliveryNotesQuery,
} from "@/lib/api/delivery-note/queries";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatQty,
} from "@/lib/format";
import type { DnListRow } from "@/types/delivery-note";

function columns(canViewSo: boolean): DataTableColumnDef<DnListRow>[] {
	const out: DataTableColumnDef<DnListRow>[] = [
		{
			accessorKey: "dnNumber",
			header: "Note no.",
			cell: ({ row }) => (
				<Link
					href={`/delivery-notes/${row.original.id}`}
					className="font-mono text-brand-accent hover:underline"
				>
					{row.original.dnNumber ?? "Draft"}
				</Link>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge doc="dn" status={row.original.status} />,
		},
		{
			accessorKey: "noteDate",
			header: "Date",
			cell: ({ row }) => formatDate(row.original.noteDate),
		},
		{
			id: "customer",
			header: "Customer",
			// Below 1100 px the SO column is hidden; its number sits under the customer.
			cell: ({ row }) => (
				<div className="flex max-w-44 flex-col whitespace-normal">
					<span>{row.original.customer.name}</span>
					<span className="text-[13px] min-[1100px]:hidden">
						<SoNumberLink
							soId={row.original.soId}
							soNumber={row.original.soNumber}
							canView={canViewSo}
						/>
					</span>
				</div>
			),
		},
		{
			accessorKey: "soNumber",
			header: "SO no.",
			meta: { hideBelow1100: true },
			cell: ({ row }) => (
				<SoNumberLink
					soId={row.original.soId}
					soNumber={row.original.soNumber}
					canView={canViewSo}
				/>
			),
		},
		{
			accessorKey: "totalQty",
			header: "Qty",
			meta: { numeric: true },
			cell: ({ row }) =>
				formatQty(
					row.original.totalQty,
					null,
					Number.isInteger(row.original.totalQty) ? 0 : 3,
				),
		},
	];
	if (canViewSo) {
		out.push({
			accessorKey: "valuePaise",
			header: "Value incl. GST",
			meta: { numeric: true },
			cell: ({ row }) => formatMoney(row.original.valuePaise),
		});
	}
	out.push(
		{
			accessorKey: "ewayBillNo",
			header: "E-way no.",
			cell: ({ row }) => {
				const r = row.original;
				return (
					<div className="flex flex-col items-start gap-1">
						<span className="font-mono">{groupEway(r.ewayBillNo)}</span>
						{r.status === "draft" && r.ewayNeeded && !r.ewayBillNo ? (
							<StatusBadge doc="dnTag" status="eway_missing" />
						) : null}
						{r.ewayExpired ? (
							<StatusBadge doc="dnTag" status="eway_expired" />
						) : null}
						{r.ewayValidUntil ? (
							<span className="text-[13px] whitespace-normal text-muted-foreground min-[1100px]:hidden">
								Valid until {formatDateTime(r.ewayValidUntil)}
							</span>
						) : null}
					</div>
				);
			},
		},
		{
			accessorKey: "ewayValidUntil",
			header: "Valid until",
			meta: { hideBelow1100: true },
			cell: ({ row }) => formatDateTime(row.original.ewayValidUntil),
		},
	);
	return out;
}

export function DeliveryNoteListView() {
	const canView = useCan("dispatch.view");
	const canViewSo = useCan("so.view");
	const controls = useDnControls();

	const query = useDeliveryNotesQuery(
		{
			page: controls.page,
			pageSize: controls.pageSize,
			status: controls.statusParam,
			customerId: controls.customerId ?? undefined,
			dateFrom: controls.dateFrom ?? undefined,
			dateTo: controls.dateTo ?? undefined,
			ewayMissing: controls.ewayMissing ? "true" : undefined,
		},
		canView && controls.rangeOk,
	);
	const rows = useMemo(() => query.data?.data ?? [], [query.data]);
	const cols = useMemo(() => columns(canViewSo), [canViewSo]);
	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns: cols,
		manualPagination: true,
		manualSorting: true,
	});

	if (!canView) return <NoAccessState what="delivery notes" />;

	const meta = query.data?.meta;
	const total = meta?.total ?? 0;
	const filtered = controls.filtersActive || controls.tab !== "all";
	const resetButton = (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => {
				controls.reset();
				controls.onTabChange("all");
			}}
		>
			Reset filters
		</Button>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Delivery notes"
				description="Every note that left or will leave the plant, and which ones still lack an e-way bill."
				actions={
					total > 0 || filtered ? (
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href="/delivery-notes/pending">Pending dispatch</Link>
						</Button>
					) : undefined
				}
			/>

			<FilterBar
				quick={DN_TABS.map((entry) => ({ ...entry, count: null }))}
				value={controls.tab}
				onChange={controls.onTabChange}
				onReset={controls.reset}
				filtersActive={controls.filtersActive}
			>
				<Input
					type="date"
					value={controls.dateFrom ?? ""}
					max={controls.dateTo ?? undefined}
					onChange={(event) => controls.onDateFromChange(event.target.value)}
					aria-label="Date from"
					className="w-36"
				/>
				<Input
					type="date"
					value={controls.dateTo ?? ""}
					min={controls.dateFrom ?? undefined}
					onChange={(event) => controls.onDateToChange(event.target.value)}
					aria-label="Date to"
					className="w-36"
				/>
				<Select
					value={
						controls.customerId === null ? "all" : String(controls.customerId)
					}
					onValueChange={(value) =>
						controls.onCustomerChange(value === "all" ? null : Number(value))
					}
				>
					<SelectTrigger className="w-44" aria-label="Customer">
						<SelectValue placeholder="Customer" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All customers</SelectItem>
						{(meta?.customers ?? []).map((customer) => (
							<SelectItem key={customer.id} value={String(customer.id)}>
								{customer.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="flex items-center gap-2">
					<Checkbox
						id="dn-eway-missing"
						checked={controls.ewayMissing}
						onCheckedChange={(checked) =>
							controls.onEwayMissingChange(checked === true)
						}
					/>
					<Label htmlFor="dn-eway-missing">E-way needed but missing</Label>
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
							title="No delivery notes yet."
							action={
								<Button type="button" size="sm" asChild>
									<Link href="/delivery-notes/pending">Pending dispatch</Link>
								</Button>
							}
						/>
					)
				}
				errorState={
					query.isError ? (
						<ErrorState
							message={dnErrorMessage(
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
				alwaysShow
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>
		</div>
	);
}
