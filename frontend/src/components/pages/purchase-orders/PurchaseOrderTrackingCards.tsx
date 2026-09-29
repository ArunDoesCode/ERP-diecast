"use client";

import { IconCalendar, IconCheck } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { CreateGrnModal } from "@/components/pages/grn/CreateGrnModal";
import { ClosePoAlert } from "@/components/pages/purchase-orders/ClosePoAlert";
import { ConfirmPoDialog } from "@/components/pages/purchase-orders/ConfirmPoDialog";
import { DelayPoDialog } from "@/components/pages/purchase-orders/DelayPoDialog";
import { EditPOModal } from "@/components/pages/purchase-orders/EditPOModal";
import { LogPoCommunicationDialog } from "@/components/pages/purchase-orders/LogPoCommunicationDialog";
import { MarkPoInvoicedDialog } from "@/components/pages/purchase-orders/MarkPoInvoicedDialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { useSubmitApprovalRequestMutation } from "@/lib/api/approval/queries";
import {
	purchaseOrderKeys,
	useCancelPurchaseOrderMutation,
} from "@/lib/api/purchase-orders/queries";
import {
	canCancelPurchaseOrder,
	canClosePurchaseOrder,
	canMarkPurchaseOrderInvoiced,
	getPOStatusBadgeStyle,
	PO_IN_TRANSIT_STATUSES,
	PO_TERMINAL_STATUSES,
} from "@/lib/po-status-badge";
import { humanizeStatusLabel } from "@/lib/pr-status-badge";
import type { PurchaseOrder } from "@/types/purchase-orders";

type PoTrackingDialogState = {
	type: "send" | "reminder" | "escalate" | "delay" | "confirm" | "invoice";
	po: PurchaseOrder;
};

type PurchaseOrderTrackingCardsProps = {
	purchaseOrders: PurchaseOrder[];
	isLoading: boolean;
};

const SKELETON_CARDS = 6;

function formatMoney(paise?: number | null) {
	return `₹${((paise ?? 0) / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 0,
	})}`;
}

function formatDate(value?: string | null) {
	if (!value) return "-";
	return new Date(value).toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function SubmitForApprovalButton({ poId }: { poId: number }) {
	const queryClient = useQueryClient();
	const mutation = useSubmitApprovalRequestMutation();

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={mutation.isPending}
			onClick={() =>
				mutation.mutate(
					{ docType: "po", docId: poId },
					{
						onSuccess: (result) => {
							if (!result.success) return;
							queryClient.invalidateQueries({
								queryKey: purchaseOrderKeys.cards(),
							});
						},
					},
				)
			}
		>
			Submit for approval
		</Button>
	);
}

function CancelPOAlert({ poId, poNumber }: { poId: number; poNumber: string }) {
	const [reason, setReason] = useState("");
	const mutation = useCancelPurchaseOrderMutation();

	return (
		<AlertDialog
			onOpenChange={(open) => {
				if (!open) setReason("");
			}}
		>
			<AlertDialogTrigger asChild>
				<Button type="button" size="sm" variant="outline">
					Cancel
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Cancel {poNumber}?</AlertDialogTitle>
					<AlertDialogDescription>
						Lines return to pending for re-order. A reason is required.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Textarea
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					placeholder="Reason for cancellation"
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={!reason.trim() || mutation.isPending}
						onClick={() => mutation.mutate({ poId, reason: reason.trim() })}
					>
						Cancel PO
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function PurchaseOrderTrackingCards({
	purchaseOrders,
	isLoading,
}: PurchaseOrderTrackingCardsProps) {
	const canManagePO = useCan("po.manage");
	const canEditGrnDraft = useCan("grn.edit_draft");
	const [editingPoId, setEditingPoId] = useState<number | null>(null);
	const [receivingPoId, setReceivingPoId] = useState<number | null>(null);
	const [dialogState, setDialogState] = useState<PoTrackingDialogState | null>(
		null,
	);

	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: SKELETON_CARDS }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
					<Card key={`po-tracking-skeleton-${index}`}>
						<CardHeader className="space-y-2">
							<Skeleton className="h-5 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</CardHeader>
						<CardContent className="space-y-3">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-5/6" />
							<Skeleton className="h-4 w-2/3" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (purchaseOrders.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No purchase orders match this filter.
				</CardContent>
			</Card>
		);
	}

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{purchaseOrders.map((po) => {
					const badgeStyle = getPOStatusBadgeStyle(po.status);
					const isOverdue =
						PO_IN_TRANSIT_STATUSES.has(po.status) &&
						Boolean(po.expectedDeliveryDate) &&
						new Date(po.expectedDeliveryDate as string) < new Date();

					return (
						<Card key={po.id}>
							<CardHeader className="space-y-2">
								<div className="flex items-start justify-between gap-2">
									<CardTitle className="text-base">{po.poNumber}</CardTitle>
									<div className="flex flex-wrap items-center justify-end gap-1">
										<Badge
											variant={badgeStyle.variant}
											className={badgeStyle.className}
										>
											{humanizeStatusLabel(po.status)}
										</Badge>
										{isOverdue ? (
											<Badge
												variant="outline"
												className="border-red-200 bg-red-100 text-red-800"
											>
												Overdue
											</Badge>
										) : null}
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									Supplier #{po.supplierId}
								</p>
							</CardHeader>

							<CardContent className="space-y-3 text-xs text-muted-foreground">
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-1">
										<IconCalendar className="size-3.5" />
										Created {formatDate(po.createdAt)}
									</div>
									<span className="font-medium text-foreground">
										{formatMoney(po.totalAmountPaise)}
									</span>
								</div>
								{po.expectedDeliveryDate ? (
									<p>Expected delivery {formatDate(po.expectedDeliveryDate)}</p>
								) : null}
								{po.revisedDeliveryDate ? (
									<p className="text-amber-700">
										Revised delivery {formatDate(po.revisedDeliveryDate)}
										{po.delayReason ? ` — ${po.delayReason}` : ""}
									</p>
								) : null}
								{po.supplierConfirmed ? (
									<p className="flex items-center gap-1 text-emerald-700">
										<IconCheck className="size-3.5" /> Confirmed
										{po.confirmationMethod ? ` (${po.confirmationMethod})` : ""}
									</p>
								) : null}

								{!canManagePO ? null : po.status === "draft" ? (
									<div className="flex flex-wrap gap-2">
										<SubmitForApprovalButton poId={po.id} />
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => setEditingPoId(po.id)}
										>
											Edit
										</Button>
									</div>
								) : !PO_TERMINAL_STATUSES.has(po.status) ? (
									<div className="flex flex-wrap gap-2">
										{po.status === "approved" ? (
											<Button
												type="button"
												size="sm"
												onClick={() => setDialogState({ type: "send", po })}
											>
												Send to supplier
											</Button>
										) : null}
										{PO_IN_TRANSIT_STATUSES.has(po.status) ? (
											<>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() =>
														setDialogState({ type: "reminder", po })
													}
												>
													Reminder
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() =>
														setDialogState({ type: "escalate", po })
													}
												>
													Escalate
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => setDialogState({ type: "delay", po })}
												>
													Delay
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() =>
														setDialogState({ type: "confirm", po })
													}
												>
													Confirm
												</Button>
											</>
										) : null}
										{canMarkPurchaseOrderInvoiced(po.status) ? (
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() => setDialogState({ type: "invoice", po })}
											>
												Mark Invoiced
											</Button>
										) : null}
										{canClosePurchaseOrder(po.status) ? (
											<ClosePoAlert poId={po.id} poNumber={po.poNumber} />
										) : null}
										{canCancelPurchaseOrder(po.status) ? (
											<CancelPOAlert poId={po.id} poNumber={po.poNumber} />
										) : null}
									</div>
								) : null}
								{/* Independent of canManagePO: grn.edit_draft holders are authorized by
								the backend to create/manage GRN drafts (creategrn, bypass) even
								though they can't manage the PO itself — never nest this inside
								the canManagePO-gated block above. */}
								{PO_IN_TRANSIT_STATUSES.has(po.status) && canEditGrnDraft ? (
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => setReceivingPoId(po.id)}
										>
											Receive goods
										</Button>
									</div>
								) : null}
							</CardContent>
						</Card>
					);
				})}
			</div>

			{editingPoId ? (
				<EditPOModal
					poId={editingPoId}
					pendingLines={[]}
					open={editingPoId !== null}
					onOpenChange={(open) => {
						if (!open) setEditingPoId(null);
					}}
					onSaved={() => setEditingPoId(null)}
				/>
			) : null}

			{receivingPoId ? (
				<CreateGrnModal
					poId={receivingPoId}
					open={receivingPoId !== null}
					onOpenChange={(open) => {
						if (!open) setReceivingPoId(null);
					}}
					onCreated={() => setReceivingPoId(null)}
				/>
			) : null}

			{dialogState?.type === "send" ||
			dialogState?.type === "reminder" ||
			dialogState?.type === "escalate" ? (
				<LogPoCommunicationDialog
					mode={dialogState.type}
					poId={dialogState.po.id}
					poNumber={dialogState.po.poNumber}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onLogged={() => setDialogState(null)}
				/>
			) : null}

			{dialogState?.type === "delay" ? (
				<DelayPoDialog
					po={dialogState.po}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onUpdated={() => setDialogState(null)}
				/>
			) : null}

			{dialogState?.type === "confirm" ? (
				<ConfirmPoDialog
					poId={dialogState.po.id}
					poNumber={dialogState.po.poNumber}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onConfirmed={() => setDialogState(null)}
				/>
			) : null}

			{dialogState?.type === "invoice" ? (
				<MarkPoInvoicedDialog
					poId={dialogState.po.id}
					poNumber={dialogState.po.poNumber}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onInvoiced={() => setDialogState(null)}
				/>
			) : null}
		</>
	);
}
