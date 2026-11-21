"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import {
	InvoiceActionDialogs,
	type InvoiceDialog,
} from "@/components/pages/supplier-invoices/InvoiceActionDialogs";
import {
	InvoiceChargesCard,
	InvoiceHistoryCard,
	InvoiceItemsCard,
	InvoicePaymentCard,
	InvoiceReleaseCard,
	InvoiceTotalsCard,
	LegacyCard,
	MatchResultCard,
} from "@/components/pages/supplier-invoices/InvoiceDetailCards";
import { DetailHeader } from "@/components/shared/DetailHeader";
import {
	DocumentFlow,
	type DocumentFlowStep,
} from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	sinvErrorMessage,
	useSupplierInvoiceQuery,
} from "@/lib/api/supplier-invoice/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type { SinvDetail } from "@/types/supplier-invoice";

function flowSteps(inv: SinvDetail): DocumentFlowStep[] {
	const steps: DocumentFlowStep[] = [];
	for (const pr of inv.flow.pr) {
		steps.push({
			label: "Purchase requisition",
			docNo: pr.number,
			status: <StatusBadge doc="pr" status={pr.status} />,
			state: "done",
		});
	}
	steps.push({
		label: "Purchase order",
		docNo: inv.flow.po.number,
		// PO detail is keyed by its requisition.
		href: inv.flow.pr[0] ? `/purchase-orders/${inv.flow.pr[0].id}` : undefined,
		status: <StatusBadge doc="po" status={inv.flow.po.status} />,
		state: "done",
	});
	for (const grn of inv.flow.grns) {
		steps.push({
			label: "Goods receipt",
			docNo: grn.number,
			href: `/grn/${grn.id}`,
			status: <StatusBadge doc="grn" status={grn.status} />,
			state: "done",
		});
	}
	steps.push({
		label: "Supplier invoice",
		docNo: inv.ourNumber,
		status: <StatusBadge doc="supplierInvoice" status={inv.status} />,
		state: "current",
	});
	return steps;
}

export function SupplierInvoiceDetailView({
	invoiceId,
}: {
	invoiceId: number;
}) {
	const canView = useCan("invoice.view");
	const canManage = useCan("invoice.manage");
	const canRelease = useCan("invoice.release");
	const userId = useAuthSessionStore((state) => state.userId);
	const query = useSupplierInvoiceQuery(canView ? invoiceId : undefined);
	const inv = query.data?.data;
	useBreadcrumbLast(inv?.ourNumber);
	const [dialog, setDialog] = useState<InvoiceDialog | null>(null);

	const back = {
		backHref: "/supplier-invoices",
		backLabel: "supplier invoices",
	};

	if (!canView) {
		return <EmptyState title="You can't view supplier invoices" />;
	}
	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !inv) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				{notFound ? (
					<EmptyState title="Invoice not found" />
				) : (
					<ErrorState
						message={sinvErrorMessage(
							query.error,
							"The invoice could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				)}
			</div>
		);
	}

	const isDraft = inv.status === "draft";
	const isBlocked = inv.status === "blocked";
	const isApproved = inv.status === "approved";
	const isCancelled = inv.status === "cancelled";
	// BR-SINV-25: nobody who created, edited, sent back or submitted the bill may release it.
	const touched = inv.history.some(
		(row) =>
			["create", "edit", "back_to_draft", "submit"].includes(row.action) &&
			String(row.createdBy) === userId,
	);
	const showRelease = isBlocked && canRelease && !touched;
	const showMore = canManage && (isDraft || isBlocked || isApproved);

	const actions = (
		<>
			{isDraft && canManage ? (
				<>
					<Button type="button" size="sm" onClick={() => setDialog("submit")}>
						Submit
					</Button>
					<Button type="button" size="sm" variant="outline" asChild>
						<Link href={`/supplier-invoices/${inv.id}/edit`}>Edit</Link>
					</Button>
				</>
			) : null}
			{showRelease ? (
				<Button type="button" size="sm" onClick={() => setDialog("release")}>
					Release
				</Button>
			) : null}
			{isBlocked && canManage ? (
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => setDialog("backToDraft")}
				>
					Back to draft
				</Button>
			) : null}
			{showMore ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm" variant="outline">
							<IconDots />
							More
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{isDraft ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("delete")}
							>
								Delete draft
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancel")}
							>
								Cancel invoice
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</>
	);

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			<DetailHeader
				docNo={inv.ourNumber}
				status={
					<span className="flex flex-wrap items-center gap-1">
						<StatusBadge doc="supplierInvoice" status={inv.status} />
						{inv.overdue ? (
							<StatusBadge doc="supplierInvoice" status="overdue" />
						) : null}
					</span>
				}
				meta={[
					{ label: "Supplier", value: inv.supplier.name },
					{
						label: "Supplier inv. no.",
						value: <span className="font-mono">{inv.invoiceNumber}</span>,
					},
					{ label: "Invoice date", value: formatDate(inv.invoiceDate) },
					{ label: "Due", value: formatDate(inv.dueDate) },
				]}
				actions={actions}
				{...back}
			/>

			<DocumentFlow steps={flowSteps(inv)} />

			{isCancelled ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					Cancelled
					{inv.cancelledAt ? ` (${formatDateTime(inv.cancelledAt)})` : ""}
					{inv.cancelReason ? `: ${inv.cancelReason}` : ""}
				</output>
			) : null}
			{isDraft ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					Draft. The match runs when you submit.
				</output>
			) : null}

			<div className="grid gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
				<div className="flex min-w-0 flex-col gap-4">
					<MatchResultCard inv={inv} />
					<InvoiceItemsCard inv={inv} />
					<InvoiceChargesCard inv={inv} />
					<LegacyCard inv={inv} />
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<InvoiceTotalsCard inv={inv} />
					<InvoicePaymentCard inv={inv} />
					<InvoiceReleaseCard inv={inv} />
					<InvoiceHistoryCard inv={inv} />
				</div>
			</div>

			<InvoiceActionDialogs
				inv={inv}
				open={dialog}
				onClose={() => setDialog(null)}
			/>
		</div>
	);
}
