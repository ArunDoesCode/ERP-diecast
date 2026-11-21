"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { roleLabel } from "@/components/pages/approval/approval-labels";
import { CancelPoAlert } from "@/components/pages/purchase-orders/CancelPoAlert";
import { ClosePoAlert } from "@/components/pages/purchase-orders/ClosePoAlert";
import { ConfirmPoDialog } from "@/components/pages/purchase-orders/ConfirmPoDialog";
import { DelayPoDialog } from "@/components/pages/purchase-orders/DelayPoDialog";
import { LogPoCommunicationDialog } from "@/components/pages/purchase-orders/LogPoCommunicationDialog";
import {
	PoLinesCard,
	poOpenQty,
} from "@/components/pages/purchase-orders/PoLinesCard";
import { ShortClosePoAlert } from "@/components/pages/purchase-orders/ShortClosePoAlert";
import {
	type ApprovalAct,
	DocApprovalActDialog,
} from "@/components/pages/purchase-requisitions/DocApprovalActDialog";
import { DocumentUnavailable } from "@/components/pages/purchase-requisitions/DocumentUnavailable";
import { EnterInvoiceButton } from "@/components/pages/supplier-invoices/EnterInvoiceButton";
import { InvoicesCard } from "@/components/pages/supplier-invoices/InvoicesCard";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { DocumentFlow } from "@/components/shared/DocumentFlow";
import { DocumentSidePanel } from "@/components/shared/DocumentSidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	useApprovalDocumentViewQuery,
	useSubmitApprovalRequestMutation,
} from "@/lib/api/approval/queries";
import {
	useDocumentPanelQuery,
	useRefreshDocumentPanel,
} from "@/lib/api/document/queries";
import type { PoPageItem } from "@/lib/api/purchase-orders/detail-types";
import { usePurchaseOrderDetailQuery } from "@/lib/api/purchase-orders/queries";
import { useSupplierInvoicesQuery } from "@/lib/api/supplier-invoice/queries";
import { formatDate, formatMoney } from "@/lib/format";
import {
	canCancelPurchaseOrder,
	canClosePurchaseOrder,
	canShortClosePurchaseOrder,
	PO_BILLABLE_STATUSES,
	PO_IN_TRANSIT_STATUSES,
} from "@/lib/po-status-badge";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type { PurchaseOrderDetailPayload } from "@/types/purchase-orders";

const LIST_HREF = "/purchase-orders";

type Dialog =
	| "send"
	| "reminder"
	| "escalate"
	| "delay"
	| "confirm"
	| "close"
	| "shortClose"
	| "cancel";

function PageSkeleton() {
	return (
		<div className="space-y-4" aria-busy="true">
			<Skeleton className="h-20 w-full" />
			<Skeleton className="h-14 w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

/** Purchase-order page keyed by PO id (screen 7, BR-FF-40, 43, 44, 68). */
export function PurchaseOrderPageView({ poId }: { poId: number }) {
	const canManagePo = useCan("po.manage");
	const canManagePr = useCan("pr.manage");
	const canViewGrn = useCan("grn.view");
	const canReceive = useCan("grn.edit_draft");
	const canViewInvoices = useCan("invoice.view");
	const currentUserId = useAuthSessionStore((s) => s.userId);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [act, setAct] = useState<ApprovalAct | null>(null);

	const detailQuery = usePurchaseOrderDetailQuery(poId, true);
	const viewQuery = useApprovalDocumentViewQuery("po", poId);
	const panelQuery = useDocumentPanelQuery("po", poId);
	const refreshPanel = useRefreshDocumentPanel();
	const submit = useSubmitApprovalRequestMutation();

	const fromKey = detailQuery.data?.success ? detailQuery.data.data : null;
	const view = viewQuery.data?.success ? viewQuery.data.data : null;
	const fromView: PurchaseOrderDetailPayload | null =
		view?.po && view.items ? { po: view.po, items: view.items } : null;
	const detail = fromKey ?? fromView;
	const po = detail?.po;
	useBreadcrumbLast(po?.poNumber);
	// Bills of this PO for the document flow (BR-SINV-38); needs invoice.view.
	const invoicesQuery = useSupplierInvoicesQuery(
		{
			page: 1,
			pageSize: 20,
			sortBy: "createdAt",
			sortDir: "asc",
			poId,
		},
		canViewInvoices && poId > 0,
	);

	if (!detail || !po) {
		if (detailQuery.isLoading || viewQuery.isLoading) return <PageSkeleton />;
		return (
			<DocumentUnavailable
				errors={[detailQuery.error, viewQuery.error]}
				listHref={LIST_HREF}
				listLabel="purchase orders"
				onRetry={() => {
					void detailQuery.refetch();
					void viewQuery.refetch();
				}}
				retrying={detailQuery.isRefetching}
			/>
		);
	}

	const items = detail.items as PoPageItem[];
	const request = view?.request ?? null;
	const canAct = view?.canAct === true && request !== null;
	const isCreator =
		currentUserId != null && String(po.createdBy) === currentUserId;
	const inTransit = PO_IN_TRANSIT_STATUSES.has(po.status);
	const hasOpenQty = items.some((item) => poOpenQty(item) > 0);

	// BR-FF-44: one primary, the rest secondary; hidden, never disabled (BR-FF-45).
	const canSubmit = po.status === "draft" && isCreator && canManagePo;
	const canSend = po.status === "approved" && canManagePo;
	const canReceiveGoods = inTransit && hasOpenQty && canReceive;
	const menu: { key: Dialog; label: string; destructive?: boolean }[] = [];
	const canEdit = canManagePo && po.status === "draft";
	if (canManagePo) {
		if (inTransit) {
			menu.push(
				{ key: "reminder", label: "Send reminder" },
				{ key: "escalate", label: "Escalate" },
				{ key: "delay", label: "Delay" },
				{ key: "confirm", label: "Confirm with supplier" },
			);
		}
		if (canClosePurchaseOrder(po.status))
			menu.push({ key: "close", label: "Close PO" });
		if (canShortClosePurchaseOrder(po.status))
			menu.push({ key: "shortClose", label: "Short-close" });
		if (canCancelPurchaseOrder(po.status))
			menu.push({ key: "cancel", label: "Cancel PO", destructive: true });
	}

	const panel = panelQuery.data?.success ? panelQuery.data.data : null;
	const linkedPr = panel?.linked.find((d) => d.docType === "pr");
	const linkedGrn = panel?.linked.find((d) => d.docType === "grn");
	const dueDate = po.revisedDeliveryDate ?? po.expectedDeliveryDate;
	// BR-SINV-29: `invoiced` is set only by a supplier invoice, never by hand.
	const billable = PO_BILLABLE_STATUSES.has(po.status);
	// BR-PRT-38: the PO's returns, and its bills, after the goods receipt.
	const returns = [...(fromKey?.returns ?? [])].sort((a, b) =>
		a.proNumber.localeCompare(b.proNumber),
	);
	const bills = [...(invoicesQuery.data?.data ?? [])].sort((a, b) =>
		a.ourNumber.localeCompare(b.ourNumber),
	);

	function closeDialog() {
		setDialog(null);
		void refreshPanel();
	}
	const dialogProps = (key: Dialog) => ({
		open: dialog === key,
		onOpenChange: (open: boolean) => {
			if (!open) setDialog(null);
		},
	});

	const actions = (
		<>
			{canAct ? (
				<>
					<Button type="button" onClick={() => setAct("approve")}>
						Approve
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => setAct("sent_back")}
					>
						Send back
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => setAct("reject")}
					>
						Reject
					</Button>
				</>
			) : null}
			{canSubmit ? (
				<Button
					type="button"
					disabled={submit.isPending}
					onClick={() =>
						submit.mutate(
							{ docType: "po", docId: po.id },
							{ onSuccess: () => void refreshPanel() },
						)
					}
				>
					{submit.isPending ? "Submitting…" : "Submit for approval"}
				</Button>
			) : null}
			{canSend ? (
				<Button type="button" onClick={() => setDialog("send")}>
					Send to supplier
				</Button>
			) : null}
			{canReceiveGoods ? (
				<Button asChild>
					<Link href={`/grn/new?po=${po.id}`}>Receive goods</Link>
				</Button>
			) : null}
			{/* invoice.manage is checked inside; independent of po.manage. */}
			<EnterInvoiceButton poId={po.id} enabled={billable} />
			{menu.length > 0 || canEdit ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							aria-label={`More actions for ${po.poNumber}`}
						>
							<IconDots className="size-3.5" />
							More
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{canEdit ? (
							<DropdownMenuItem asChild>
								<Link href={`${LIST_HREF}/${po.id}/edit`}>Edit</Link>
							</DropdownMenuItem>
						) : null}
						{menu.map((item) => (
							<DropdownMenuItem
								key={item.key}
								variant={item.destructive ? "destructive" : undefined}
								onSelect={() => setDialog(item.key)}
							>
								{item.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={po.poNumber}
				status={<StatusBadge doc="po" status={po.status} />}
				backHref={LIST_HREF}
				backLabel="purchase orders"
				meta={[
					{ label: "Supplier", value: po.supplierName },
					{ label: "Date", value: formatDate(po.createdAt) },
					{ label: "Expected", value: formatDate(dueDate) },
					{ label: "Total", value: formatMoney(po.totalAmountPaise) },
				]}
				actions={actions}
			/>
			<DocumentFlow
				steps={[
					{
						label: "Requisition",
						docNo: linkedPr?.number,
						href:
							linkedPr?.canOpen || (linkedPr && canManagePr)
								? `/purchase-requisitions/${linkedPr.id}`
								: undefined,
						status: linkedPr ? (
							<StatusBadge doc="pr" status={linkedPr.status} />
						) : undefined,
						state: linkedPr ? "done" : "todo",
					},
					{
						label: "Purchase order",
						docNo: po.poNumber,
						status: <StatusBadge doc="po" status={po.status} />,
						state: "current",
					},
					{
						label: "Goods receipt",
						docNo: linkedGrn?.number,
						href:
							linkedGrn && (linkedGrn.canOpen || canViewGrn)
								? `/grn/${linkedGrn.id}`
								: undefined,
						status: linkedGrn ? (
							<StatusBadge doc="grn" status={linkedGrn.status} />
						) : undefined,
						state: linkedGrn ? "done" : "todo",
					},
					...returns.map((entry) => ({
						label: "Purchase return",
						docNo: entry.proNumber,
						href: `/purchase-returns/${entry.id}`,
						status: <StatusBadge doc="purchaseReturn" status={entry.status} />,
						state: "done" as const,
					})),
					...bills.map((row) => ({
						label: "Supplier invoice",
						docNo: row.ourNumber,
						href: `/supplier-invoices/${row.id}`,
						status: <StatusBadge doc="supplierInvoice" status={row.status} />,
						state: "done" as const,
					})),
				]}
			/>
			<TwoPaneLayout
				sideLabel="Order details"
				side={
					<DocumentSidePanel
						docType="po"
						docId={po.id}
						waitingFor={
							request ? roleLabel(request.currentApproverRole) : undefined
						}
						pinnedHistory={
							po.revisedDeliveryDate ? (
								<span className="text-sm">
									Delayed to {formatDate(po.revisedDeliveryDate)}
									{po.delayReason ? ` — ${po.delayReason}` : ""}
								</span>
							) : undefined
						}
					/>
				}
			>
				<Card>
					<CardHeader>
						<CardTitle>Details</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">Payment terms</dt>
								<dd>
									{po.paymentTermsDays != null
										? `${po.paymentTermsDays} days`
										: "–"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Delivery terms</dt>
								<dd>{po.deliveryTerms ?? "–"}</dd>
							</div>
							<div className="sm:col-span-2">
								<dt className="text-muted-foreground">Notes</dt>
								<dd>{po.notes?.trim() || view?.requesterNote || "–"}</dd>
							</div>
							{po.status === "cancelled" && po.cancelReason ? (
								<div className="sm:col-span-2">
									<dt className="text-muted-foreground">
										Cancelled
										{po.cancelledByName ? ` by ${po.cancelledByName}` : ""}
									</dt>
									<dd>{po.cancelReason}</dd>
								</div>
							) : null}
							{po.shortClosed ? (
								<div className="sm:col-span-2">
									<dd>Short-closed (rest not received)</dd>
								</div>
							) : null}
						</dl>
					</CardContent>
				</Card>
				<PoLinesCard items={items} />
				{billable || po.status === "invoiced" ? (
					<InvoicesCard poId={po.id} canEnter={billable} />
				) : null}
			</TwoPaneLayout>

			{canAct && request ? (
				<DocApprovalActDialog
					act={act}
					docNumber={po.poNumber}
					requestId={request.id}
					onClose={() => setAct(null)}
				/>
			) : null}
			{dialog === "send" || dialog === "reminder" || dialog === "escalate" ? (
				<LogPoCommunicationDialog
					mode={dialog}
					poId={po.id}
					poNumber={po.poNumber}
					{...dialogProps(dialog)}
					onLogged={closeDialog}
				/>
			) : null}
			{dialog === "delay" ? (
				<DelayPoDialog
					po={{ id: po.id, poNumber: po.poNumber }}
					{...dialogProps("delay")}
					onUpdated={closeDialog}
				/>
			) : null}
			{dialog === "confirm" ? (
				<ConfirmPoDialog
					poId={po.id}
					poNumber={po.poNumber}
					{...dialogProps("confirm")}
					onConfirmed={closeDialog}
				/>
			) : null}
			{dialog === "close" ? (
				<ClosePoAlert
					poId={po.id}
					poNumber={po.poNumber}
					{...dialogProps("close")}
				/>
			) : null}
			{dialog === "shortClose" ? (
				<ShortClosePoAlert
					poId={po.id}
					poNumber={po.poNumber}
					{...dialogProps("shortClose")}
				/>
			) : null}
			{dialog === "cancel" ? (
				<CancelPoAlert
					poId={po.id}
					poNumber={po.poNumber}
					{...dialogProps("cancel")}
					onCancelled={closeDialog}
				/>
			) : null}
		</div>
	);
}
