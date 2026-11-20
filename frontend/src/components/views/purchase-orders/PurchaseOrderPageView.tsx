"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { roleLabel } from "@/components/pages/approval/approval-labels";
import { CancelPoAlert } from "@/components/pages/purchase-orders/CancelPoAlert";
import { ClosePoAlert } from "@/components/pages/purchase-orders/ClosePoAlert";
import { ConfirmPoDialog } from "@/components/pages/purchase-orders/ConfirmPoDialog";
import { DelayPoDialog } from "@/components/pages/purchase-orders/DelayPoDialog";
import { EditPOModal } from "@/components/pages/purchase-orders/EditPOModal";
import { LogPoCommunicationDialog } from "@/components/pages/purchase-orders/LogPoCommunicationDialog";
import { MarkPoInvoicedDialog } from "@/components/pages/purchase-orders/MarkPoInvoicedDialog";
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
import { formatDate, formatMoney } from "@/lib/format";
import {
	canCancelPurchaseOrder,
	canClosePurchaseOrder,
	canMarkPurchaseOrderInvoiced,
	canShortClosePurchaseOrder,
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
	| "invoice"
	| "close"
	| "shortClose"
	| "cancel"
	| "edit";

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
	if (canManagePo) {
		if (po.status === "draft") menu.push({ key: "edit", label: "Edit" });
		if (inTransit) {
			menu.push(
				{ key: "reminder", label: "Send reminder" },
				{ key: "escalate", label: "Escalate" },
				{ key: "delay", label: "Delay" },
				{ key: "confirm", label: "Confirm with supplier" },
			);
		}
		if (canMarkPurchaseOrderInvoiced(po.status))
			menu.push({ key: "invoice", label: "Mark invoiced" });
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
			{menu.length > 0 ? (
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
			{dialog === "invoice" ? (
				<MarkPoInvoicedDialog
					poId={po.id}
					poNumber={po.poNumber}
					{...dialogProps("invoice")}
					onInvoiced={closeDialog}
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
			{dialog === "edit" ? (
				<EditPOModal
					poId={po.id}
					pendingLines={[]}
					{...dialogProps("edit")}
					onSaved={closeDialog}
				/>
			) : null}
		</div>
	);
}
