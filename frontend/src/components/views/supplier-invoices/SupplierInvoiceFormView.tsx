"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
	InvoiceForm,
	type InvoiceFormSource,
} from "@/components/pages/supplier-invoices/InvoiceForm";
import type { CatalogLine } from "@/components/pages/supplier-invoices/invoice-form-types";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError } from "@/lib/api/client";
import { useGrnDetailQuery } from "@/lib/api/grn/queries";
import { usePurchaseOrdersQuery } from "@/lib/api/purchase-orders/queries";
import { useCompanySettingsQuery } from "@/lib/api/subcontracting/queries";
import {
	sinvErrorMessage,
	useBillableLinesQuery,
	useInvoiceTolerancesQuery,
	useSupplierInvoiceQuery,
} from "@/lib/api/supplier-invoice/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

// Plant tolerance defaults (BR-SINV-32) until the real values load.
const DEFAULT_PRICE_TOL = 0;
const DEFAULT_WEIGHT_TOL = 0.5;

const PO_PICK_PAGE_SIZE = 10;

function PoPicker() {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [open, setOpen] = useState(false);
	const [picked, setPicked] = useState<{ id: number; label: string } | null>(
		null,
	);
	const debounced = useDebouncedValue(search, 300);
	const pos = usePurchaseOrdersQuery({
		page: 1,
		pageSize: PO_PICK_PAGE_SIZE,
		sortBy: "createdAt",
		sortDir: "desc",
		status: ["partial_received", "fully_received", "closed"],
		q: debounced.trim() || undefined,
	});
	const rows = pos.data?.data ?? [];
	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Enter supplier invoice"
				description="Pick the purchase order the bill is for."
			/>
			<div className="relative max-w-sm min-h-19 space-y-1">
				<Label htmlFor="sinv-po-pick">Purchase order *</Label>
				<Input
					id="sinv-po-pick"
					placeholder="Search by PO number or supplier"
					autoComplete="off"
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						setPicked(null);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => setOpen(false)}
				/>
				{open ? (
					<div className="absolute z-50 mt-1 w-full rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
						{pos.isLoading ? (
							<p className="p-2 text-muted-foreground">Loading…</p>
						) : rows.length === 0 ? (
							<p className="p-2 text-muted-foreground">
								No purchase orders found.
							</p>
						) : (
							<div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
								{rows.map((po) => {
									const label = `${po.poNumber} · ${po.supplierName}`;
									return (
										<button
											key={po.id}
											type="button"
											onMouseDown={(event) => event.preventDefault()}
											onClick={() => {
												setPicked({ id: po.id, label });
												setSearch(label);
												setOpen(false);
											}}
											className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
										>
											{label}
										</button>
									);
								})}
							</div>
						)}
					</div>
				) : null}
				{pos.isError ? (
					<p className="text-[13px] text-destructive">
						The PO list could not be loaded.
					</p>
				) : null}
			</div>
			<div className="flex gap-2">
				<Button type="button" variant="outline" asChild>
					<Link href="/supplier-invoices">Cancel</Link>
				</Button>
				<Button
					type="button"
					disabled={picked === null}
					onClick={() =>
						picked && router.push(`/supplier-invoices/new?poId=${picked.id}`)
					}
				>
					Continue
				</Button>
			</div>
		</div>
	);
}

/** New invoice (`poId` and optional `grnId`) or edit a draft (`invoiceId`). */
export function SupplierInvoiceFormView({
	poId: poIdParam,
	grnId,
	invoiceId,
}: {
	poId?: number;
	grnId?: number;
	invoiceId?: number;
}) {
	const router = useRouter();
	const canManage = useCan("invoice.manage");
	const canSco = useCan("sco.view");
	const isEdit = invoiceId !== undefined;

	const detailQuery = useSupplierInvoiceQuery(invoiceId);
	const existing = detailQuery.data?.data;

	// A link from a GRN may carry only the GRN: its PO comes from the GRN detail.
	const needGrn = !isEdit && poIdParam === undefined && grnId !== undefined;
	const grnQuery = useGrnDetailQuery(grnId ?? 0, canManage && needGrn);
	const grnPoId = grnQuery.data?.success
		? (grnQuery.data.data.grn.poId ?? undefined)
		: undefined;
	const poId = isEdit ? existing?.poId : (poIdParam ?? grnPoId);

	const billableQuery = useBillableLinesQuery(
		poId,
		isEdit ? undefined : grnId,
		canManage,
	);
	const billable = billableQuery.data?.data;
	const tolerances = useInvoiceTolerancesQuery(canManage);
	const company = useCompanySettingsQuery(canSco);

	useBreadcrumbLast(isEdit ? existing?.ourNumber : "New invoice");

	// Only drafts can be edited: anything else goes to the detail page.
	const status = existing?.status;
	useEffect(() => {
		if (isEdit && status !== undefined && status !== "draft") {
			router.replace(`/supplier-invoices/${invoiceId}`);
		}
	}, [router, isEdit, invoiceId, status]);

	const source = useMemo<InvoiceFormSource | null>(() => {
		if (existing) {
			const own: CatalogLine[] = existing.lines
				.filter((line) => line.kind === "item" && line.grnItemId !== null)
				.map((line) => ({
					grnItemId: line.grnItemId as number,
					grnNumber: line.grnNumber ?? "",
					itemName: line.itemName ?? "",
					uom: line.uom ?? "",
					billableQty: line.billableQty ?? line.qty ?? 0,
					poRatePaise: line.poRatePaise ?? line.ratePaise ?? 0,
					poGstPercent: (line.poGstBp ?? line.gstBp) / 100,
				}));
			const ownIds = new Set(own.map((line) => line.grnItemId));
			const extra = (billable?.lines ?? [])
				.filter((line) => !ownIds.has(line.grnItemId))
				.map<CatalogLine>((line) => ({ ...line }));
			return {
				poId: existing.poId,
				poNumber: existing.poNumber,
				supplier: existing.supplier,
				paymentTermsDays: existing.paymentTermsDays,
				prId: existing.prId,
				catalog: [...own, ...extra],
			};
		}
		if (billable) {
			return {
				poId: billable.po.id,
				poNumber: billable.po.poNumber,
				supplier: billable.supplier,
				paymentTermsDays: billable.po.paymentTermsDays,
				prId: billable.po.prId,
				catalog: billable.lines.map<CatalogLine>((line) => ({ ...line })),
			};
		}
		return null;
	}, [existing, billable]);

	if (!canManage) {
		return <EmptyState title="You can't enter supplier invoices" />;
	}
	if (!isEdit && poIdParam === undefined && grnId === undefined) {
		return <PoPicker />;
	}

	const loading =
		(isEdit && detailQuery.isLoading) ||
		(needGrn && grnQuery.isLoading) ||
		(poId !== undefined && billableQuery.isLoading && !existing) ||
		(isEdit && !existing && !detailQuery.isError);
	if (loading) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}

	const failed = detailQuery.isError
		? detailQuery
		: needGrn && grnQuery.isError
			? grnQuery
			: !existing && billableQuery.isError
				? billableQuery
				: null;
	if (failed) {
		const error = failed.error;
		// PO not billable (409) or nothing to bill: an empty state with the way back.
		if (
			error instanceof ApiClientError &&
			error.code === "SINV_PO_NOT_BILLABLE"
		) {
			return <NothingToBill message={error.message} grnId={grnId} />;
		}
		return (
			<ErrorState
				message={sinvErrorMessage(error, "The invoice could not be loaded.")}
				onRetry={() => {
					void failed.refetch();
				}}
				retrying={failed.isRefetching}
			/>
		);
	}
	if (existing && existing.status !== "draft") return null;
	if (!source) return null;

	if (!existing && source.catalog.length === 0) {
		return <NothingToBill grnId={grnId} prId={source.prId} />;
	}

	return (
		<InvoiceForm
			key={existing ? existing.id : source.poId}
			source={source}
			existing={existing}
			grnId={grnId}
			plantStateCode={company.data?.data?.stateCode ?? null}
			priceTolerancePercent={
				tolerances.data?.data.priceTolerancePercent ?? DEFAULT_PRICE_TOL
			}
			weightTolerancePercent={
				tolerances.data?.data.weightTolerancePercent ?? DEFAULT_WEIGHT_TOL
			}
		/>
	);
}

function NothingToBill({
	message,
	grnId,
	prId,
}: {
	message?: string;
	grnId?: number;
	prId?: number | null;
}) {
	return (
		<EmptyState
			title="Nothing left to bill on this PO"
			description={message}
			action={
				<Button type="button" variant="outline" size="sm" asChild>
					<Link
						href={
							grnId
								? `/grn/${grnId}`
								: prId
									? `/purchase-orders/${prId}`
									: "/purchase-orders/tracking"
						}
					>
						{grnId
							? "Back to the GRN"
							: prId
								? "Back to the PO"
								: "Back to purchase orders"}
					</Link>
				</Button>
			}
		/>
	);
}
