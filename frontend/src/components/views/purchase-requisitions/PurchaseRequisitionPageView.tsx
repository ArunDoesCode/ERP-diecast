"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { roleLabel } from "@/components/pages/approval/approval-labels";
import { CancelPrLineDialog } from "@/components/pages/purchase-requisitions/CancelPrLineDialog";
import { CancelPurchaseRequisitionDialog } from "@/components/pages/purchase-requisitions/CancelPurchaseRequisitionDialog";
import { CreatePoAction } from "@/components/pages/purchase-requisitions/CreatePoAction";
import {
	type ApprovalAct,
	DocApprovalActDialog,
} from "@/components/pages/purchase-requisitions/DocApprovalActDialog";
import { DocumentUnavailable } from "@/components/pages/purchase-requisitions/DocumentUnavailable";
import { PrLinesCard } from "@/components/pages/purchase-requisitions/PrLinesCard";
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
import { useMachinesQuery } from "@/lib/api/asset/queries";
import {
	useDocumentPanelQuery,
	useRefreshDocumentPanel,
} from "@/lib/api/document/queries";
import { usePurchaseOrderDetailQuery } from "@/lib/api/purchase-orders/queries";
import type { PrPageItem } from "@/lib/api/purchase-requisitions/detail-types";
import { usePurchaseRequisitionDetailQuery } from "@/lib/api/purchase-requisitions/queries";
import { usePrLinesQuery, useRfqsQuery } from "@/lib/api/rfq/queries";
import { useSupplierInvoicesQuery } from "@/lib/api/supplier-invoice/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type {
	PRLinkedPo,
	PurchaseRequisitionDetailPayload,
} from "@/types/purchase-requisitions";

const LIST_HREF = "/purchase-requisitions";
const RECEIVED_PO_STATUSES = new Set([
	"partial_received",
	"fully_received",
	"invoiced",
	"closed",
]);

function MachineValue({ assetId }: { assetId: number }) {
	const query = useMachinesQuery({ page: 1, pageSize: 100 });
	const name = query.data?.data.find((m) => m.id === assetId)?.name;
	return <>{name ?? `Machine #${assetId}`}</>;
}

function PageSkeleton() {
	return (
		<div className="space-y-4" aria-busy="true">
			<Skeleton className="h-20 w-full" />
			<Skeleton className="h-14 w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

/** Requisition page (screen 4, BR-FF-40, 43, 44, 50..54, 90). */
export function PurchaseRequisitionPageView({ prId }: { prId: number }) {
	const canManagePr = useCan("pr.manage");
	const canManagePo = useCan("po.manage");
	const canManageRfq = useCan("rfq.manage");
	const canViewRfq = useCan("rfq.view");
	const canViewRun = useCan("inventory.view");
	const canViewInvoices = useCan("invoice.view");
	const currentUserId = useAuthSessionStore((s) => s.userId);
	const isSuperAdmin = useAuthSessionStore((s) => s.isSuperAdmin);
	const [act, setAct] = useState<ApprovalAct | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [cancelLine, setCancelLine] = useState<PrPageItem | null>(null);

	const detailQuery = usePurchaseRequisitionDetailQuery(prId, true);
	// Approver read path (BR-FF-53) + who can act now; also the body when the doc key is missing.
	const viewQuery = useApprovalDocumentViewQuery("pr", prId);
	const panelQuery = useDocumentPanelQuery("pr", prId);
	const refreshPanel = useRefreshDocumentPanel();
	const submit = useSubmitApprovalRequestMutation();

	const fromKey = detailQuery.data?.success ? detailQuery.data.data : null;
	const view = viewQuery.data?.success ? viewQuery.data.data : null;
	const fromView: PurchaseRequisitionDetailPayload | null =
		view?.pr && view.items
			? { pr: view.pr, items: view.items, linkedPos: view.linkedPos ?? [] }
			: null;
	const detail = fromKey ?? fromView;
	const pr = detail?.pr;
	useBreadcrumbLast(pr?.prNumber);

	// Lines on an open RFQ come from the RFQ screen (BR-RFQ-02); only rfq.manage can read them.
	const rfqLinesQuery = usePrLinesQuery(
		{ prId, pageSize: 100, sortBy: "id" },
		canManageRfq && prId > 0,
	);
	const onRfq = useMemo(() => {
		const map = new Map<number, { id: number; number: string }>();
		for (const row of rfqLinesQuery.data?.data ?? []) {
			if (row.onOpenRfq && row.openRfqId && row.openRfqNumber) {
				map.set(row.id, { id: row.openRfqId, number: row.openRfqNumber });
			}
		}
		return map;
	}, [rfqLinesQuery.data]);
	// Every RFQ with a line from this PR, any status (needs rfq.view).
	const rfqsQuery = useRfqsQuery(
		{ page: 1, pageSize: 50, sortBy: "createdAt", sortDir: "asc", prId },
		canViewRfq && prId > 0,
	);
	// Returns and bills of the first live PO (the PO the flow shows).
	const firstPoId =
		detail?.linkedPos.find((po) => po.status !== "cancelled")?.id ?? 0;
	const firstPoQuery = usePurchaseOrderDetailQuery(
		firstPoId,
		firstPoId > 0 && canManagePo,
	);
	const invoicesQuery = useSupplierInvoicesQuery(
		{
			page: 1,
			pageSize: 20,
			sortBy: "createdAt",
			sortDir: "asc",
			poId: firstPoId,
		},
		firstPoId > 0 && canViewInvoices,
	);

	if (!detail || !pr) {
		if (detailQuery.isLoading || viewQuery.isLoading) return <PageSkeleton />;
		return (
			<DocumentUnavailable
				errors={[detailQuery.error, viewQuery.error]}
				listHref={LIST_HREF}
				listLabel="requisitions"
				onRetry={() => {
					void detailQuery.refetch();
					void viewQuery.refetch();
				}}
				retrying={detailQuery.isRefetching}
			/>
		);
	}

	const items = detail.items as PrPageItem[];
	const linkedPos: PRLinkedPo[] = detail.linkedPos;
	const pendingLines = items.filter((i) => i.status === "pending");
	// A line on an open RFQ cannot go on a PO (BR-RFQ-02).
	const orderableLines = pendingLines.filter((i) => !onRfq.has(i.id));
	const isCreator =
		currentUserId != null && String(pr.requestedBy) === currentUserId;
	const isOwnerOrAdmin = isCreator || isSuperAdmin;
	const request = view?.request ?? null;
	const canAct = view?.canAct === true && request !== null;
	const panelApprovals = panelQuery.data?.success
		? panelQuery.data.data.approvals
		: null;

	const canSubmit = pr.status === "draft" && isCreator && canManagePr;
	const canCreatePo =
		(pr.status === "approved" || pr.status === "partial_ordered") &&
		orderableLines.length > 0 &&
		canManagePo;
	// BR-RFQ-60: Request quotes with rfq.manage while a pending line is free.
	const canRequestQuotes =
		canManageRfq &&
		(pr.status === "approved" || pr.status === "partial_ordered") &&
		orderableLines.length > 0;
	const canEdit = pr.status === "draft" && canManagePr && isOwnerOrAdmin;
	const canCancel = pr.status !== "cancelled" && canManagePr && isOwnerOrAdmin;
	const canCancelLines =
		(pr.status === "approved" || pr.status === "partial_ordered") &&
		canManagePr &&
		isOwnerOrAdmin;

	// BR-FF-90: sent-back note until the draft is submitted again.
	const sentBack =
		pr.status === "draft" && panelApprovals?.status === "require_more_info"
			? [...panelApprovals.trail]
					.reverse()
					.find(
						(e) => e.action === "require_more_info" || e.action === "sent_back",
					)
			: undefined;

	const livePos = linkedPos.filter((po) => po.status !== "cancelled");
	const firstPo = livePos[0];
	const received = livePos.some((po) => RECEIVED_PO_STATUSES.has(po.status));
	const rfqs = rfqsQuery.data?.data ?? [];
	const returns = [
		...(firstPoQuery.data?.success
			? (firstPoQuery.data.data.returns ?? [])
			: []),
	].sort((a, b) => a.proNumber.localeCompare(b.proNumber));
	const bills = [...(invoicesQuery.data?.data ?? [])].sort((a, b) =>
		a.ourNumber.localeCompare(b.ourNumber),
	);

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
							{ docType: "pr", docId: pr.id },
							{ onSuccess: () => void refreshPanel() },
						)
					}
				>
					{submit.isPending ? "Submitting…" : "Submit for approval"}
				</Button>
			) : null}
			{canCreatePo ? (
				<CreatePoAction prId={pr.id} pendingLines={orderableLines} />
			) : null}
			{canRequestQuotes ? (
				<Button type="button" variant="outline" asChild>
					<Link href={`/rfq/new?pr=${pr.id}`}>Request quotes</Link>
				</Button>
			) : null}
			{canEdit || canCancel ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							aria-label={`More actions for ${pr.prNumber}`}
						>
							<IconDots className="size-3.5" />
							More
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{canEdit ? (
							<DropdownMenuItem asChild>
								<Link href={`${LIST_HREF}/${pr.id}/edit`}>Edit</Link>
							</DropdownMenuItem>
						) : null}
						{canCancel ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setCancelOpen(true)}
							>
								Cancel requisition
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</>
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={pr.prNumber}
				status={
					pr.reorderRunId ? (
						<span className="flex items-center gap-2">
							<StatusBadge doc="prSource" status="reorder" />
							<StatusBadge doc="pr" status={pr.status} />
						</span>
					) : (
						<StatusBadge doc="pr" status={pr.status} />
					)
				}
				backHref={LIST_HREF}
				backLabel="requisitions"
				meta={[
					{
						label: "Raised by",
						value: pr.requestedByName ?? `#${pr.requestedBy}`,
					},
					{ label: "Date", value: formatDate(pr.createdAt) },
					{ label: "Type", value: pr.type.replace(/_/g, " ") },
					{ label: "Estimate", value: formatMoney(pr.estimatedAmountPaise) },
				]}
				actions={actions}
			/>
			<DocumentFlow
				steps={[
					// BR-RO-17: a PR raised by a reorder run starts at that run.
					...(pr.reorderRunId
						? [
								{
									label: "Reorder run",
									docNo: `Run ${pr.reorderRunId}`,
									href: canViewRun
										? `/inventory/reorder/runs/${pr.reorderRunId}`
										: undefined,
									state: "done" as const,
								},
							]
						: []),
					{
						label: "Requisition",
						docNo: pr.prNumber,
						status: <StatusBadge doc="pr" status={pr.status} />,
						state: "current",
					},
					...rfqs.map((rfq) => ({
						label: "RFQ",
						docNo: rfq.rfqNumber,
						href: `/rfq/${rfq.id}`,
						status: <StatusBadge doc="rfq" status={rfq.status} />,
						state: "done" as const,
					})),
					{
						label: "Purchase order",
						docNo: firstPo
							? livePos.length > 1
								? `${firstPo.poNumber} +${livePos.length - 1}`
								: firstPo.poNumber
							: undefined,
						href:
							firstPo && canManagePo
								? `/purchase-orders/${firstPo.id}`
								: undefined,
						status: firstPo ? (
							<StatusBadge doc="po" status={firstPo.status} />
						) : undefined,
						state: firstPo ? "done" : "todo",
					},
					{
						label: "Goods receipt",
						status: received ? <span>Received</span> : undefined,
						state: received ? "done" : "todo",
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
				sideLabel="Requisition details"
				side={
					<DocumentSidePanel
						docType="pr"
						docId={pr.id}
						waitingFor={
							request ? roleLabel(request.currentApproverRole) : undefined
						}
					/>
				}
			>
				{sentBack ? (
					<div
						role="alert"
						className="rounded-md border border-warning bg-warning-subtle p-3 text-sm text-warning"
					>
						Sent back{sentBack.actorName ? ` by ${sentBack.actorName}` : ""}
						{sentBack.notes ? `: ${sentBack.notes}` : ""}
					</div>
				) : null}
				<Card>
					<CardHeader>
						<CardTitle>Details</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
							{pr.assetId ? (
								<div>
									<dt className="text-muted-foreground">Machine</dt>
									<dd>
										<MachineValue assetId={pr.assetId} />
									</dd>
								</div>
							) : null}
							<div>
								<dt className="text-muted-foreground">Notes</dt>
								<dd>{pr.notes?.trim() || view?.requesterNote || "–"}</dd>
							</div>
							{pr.status === "cancelled" && pr.cancelReason ? (
								<div className="sm:col-span-2">
									<dt className="text-muted-foreground">
										Cancelled
										{pr.cancelledByName ? ` by ${pr.cancelledByName}` : ""}
									</dt>
									<dd>{pr.cancelReason}</dd>
								</div>
							) : null}
						</dl>
					</CardContent>
				</Card>
				<PrLinesCard
					items={items}
					canOpenPo={canManagePo}
					onRfq={onRfq}
					canOpenRfq={canViewRfq}
					onCancelLine={canCancelLines ? setCancelLine : undefined}
				/>
			</TwoPaneLayout>

			{canAct && request ? (
				<DocApprovalActDialog
					act={act}
					docNumber={pr.prNumber}
					requestId={request.id}
					onClose={() => setAct(null)}
				/>
			) : null}
			<CancelPurchaseRequisitionDialog
				prId={pr.id}
				prNumber={pr.prNumber}
				open={cancelOpen}
				onOpenChange={setCancelOpen}
				onCancelled={() => {
					setCancelOpen(false);
					void refreshPanel();
				}}
			/>
			{cancelLine ? (
				<CancelPrLineDialog
					prId={pr.id}
					lineId={cancelLine.id}
					itemName={cancelLine.itemName ?? "line"}
					open
					onOpenChange={(open) => {
						if (!open) setCancelLine(null);
					}}
				/>
			) : null}
		</div>
	);
}
