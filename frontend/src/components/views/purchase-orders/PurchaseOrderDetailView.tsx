"use client";

import {
	IconCurrencyRupee,
	IconDots,
	IconFileInvoice,
	IconTruckDelivery,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchableSelect } from "@/components/common/SearchableSelect";
import { ApprovalHistoryPanel } from "@/components/pages/approval/ApprovalHistoryPanel";
import { CreateGrnModal } from "@/components/pages/grn/CreateGrnModal";
import { ClosePoAlert } from "@/components/pages/purchase-orders/ClosePoAlert";
import { ConfirmPoDialog } from "@/components/pages/purchase-orders/ConfirmPoDialog";
import { DelayPoDialog } from "@/components/pages/purchase-orders/DelayPoDialog";
import { EditPOModal } from "@/components/pages/purchase-orders/EditPOModal";
import { LogPoCommunicationDialog } from "@/components/pages/purchase-orders/LogPoCommunicationDialog";
import { MarkPoInvoicedDialog } from "@/components/pages/purchase-orders/MarkPoInvoicedDialog";
import { PoDetailPanel } from "@/components/pages/purchase-orders/PoDetailPanel";
import { ShortClosePoAlert } from "@/components/pages/purchase-orders/ShortClosePoAlert";
import { CancelPrLineDialog } from "@/components/pages/purchase-requisitions/CancelPrLineDialog";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { DocumentFlow } from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatusFlashRow } from "@/components/shared/StatusFlashRow";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { useSubmitApprovalRequestMutation } from "@/lib/api/approval/queries";
import {
	toPOCreatePayload,
	useCancelPurchaseOrderMutation,
	useCreatePurchaseOrderMutation,
	useItemLastRateQuery,
} from "@/lib/api/purchase-orders/queries";
import {
	purchaseRequisitionKeys,
	usePurchaseRequisitionDetailQuery,
} from "@/lib/api/purchase-requisitions/queries";
import {
	useSupplierDetailQuery,
	useSupplierItemsQuery,
	useSuppliersQuery,
} from "@/lib/api/suppliers/queries";
import { formatDate, formatMoney } from "@/lib/format";
import {
	canCancelPurchaseOrder,
	canClosePurchaseOrder,
	canMarkPurchaseOrderInvoiced,
	canShortClosePurchaseOrder,
	PO_IN_TRANSIT_STATUSES,
	PO_TERMINAL_STATUSES,
} from "@/lib/po-status-badge";
import { humanizeStatusLabel } from "@/lib/pr-status-badge";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import {
	GST_PERCENT_VALUES,
	type LastRateSource,
	PO_REASON_MAX,
	PO_REASON_MIN,
	type POStatus,
} from "@/types/purchase-orders";
import type {
	PRLinkedPo,
	PurchaseRequisition,
	PurchaseRequisitionItem,
} from "@/types/purchase-requisitions";
import type { Supplier } from "@/types/suppliers";

function pendingLines(lines: PurchaseRequisitionItem[]) {
	return lines.filter((line) => line.status === "pending");
}

function supplierGroups(lines: PurchaseRequisitionItem[]) {
	const groups = new Map<number, { id: number; name: string; count: number }>();

	for (const line of pendingLines(lines)) {
		if (!line.defaultSupplierId || !line.defaultSupplierName) continue;

		const existing = groups.get(line.defaultSupplierId);
		groups.set(line.defaultSupplierId, {
			id: line.defaultSupplierId,
			name: line.defaultSupplierName,
			count: (existing?.count ?? 0) + 1,
		});
	}

	return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sameDefaultSupplier(lines: PurchaseRequisitionItem[]) {
	const supplierIds = new Set(
		lines
			.map((line) => line.defaultSupplierId)
			.filter((supplierId): supplierId is number => Boolean(supplierId)),
	);

	return supplierIds.size === 1 ? [...supplierIds][0] : undefined;
}

function statusBadgeClass(status: string) {
	if (status === "pending")
		return "border-amber-200 bg-amber-100 text-amber-800";
	if (status === "po_draft") return "border-sky-200 bg-sky-100 text-sky-800";
	if (status === "ordered")
		return "border-emerald-200 bg-emerald-100 text-emerald-800";
	if (status === "cancelled")
		return "border-zinc-300 bg-zinc-100 text-zinc-700";
	return "border-slate-300 bg-slate-100 text-slate-800";
}

export function PurchaseOrderDetailView({ prId }: { prId: number }) {
	const canManagePO = useCan("po.manage");
	const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [createOpen, setCreateOpen] = useState(false);
	const [cancelLine, setCancelLine] = useState<PurchaseRequisitionItem | null>(
		null,
	);
	const currentUserId = useAuthSessionStore((state) => state.userId);
	const isSuperAdmin = useAuthSessionStore((state) => state.isSuperAdmin);

	const detailQuery = usePurchaseRequisitionDetailQuery(prId, prId > 0);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const lines = detail?.items ?? [];
	const selectedLines = lines.filter((line) => selectedLineIds.has(line.id));
	const pr = detail?.pr;
	useBreadcrumbLast(pr?.prNumber);
	// BR-PR-33: a pending line can be cancelled on its own while the PR is
	// approved or partly ordered, by the requester (super-admin: the API allows it too).
	const canCancelLines =
		pr != null &&
		(pr.status === "approved" || pr.status === "partial_ordered") &&
		((currentUserId != null && String(pr.requestedBy) === currentUserId) ||
			isSuperAdmin);

	function toggleLine(lineId: number, checked: boolean) {
		setSelectedLineIds((current) => {
			const next = new Set(current);
			if (checked) {
				next.add(lineId);
			} else {
				next.delete(lineId);
			}
			return next;
		});
	}

	function selectSupplierGroup(supplierId: number) {
		setSelectedLineIds(
			new Set(
				pendingLines(lines)
					.filter((line) => line.defaultSupplierId === supplierId)
					.map((line) => line.id),
			),
		);
	}

	return (
		<div className="flex w-full max-w-[1100px] flex-col gap-4">
			{detailQuery.isLoading ? (
				<DetailSkeleton />
			) : detailQuery.isError ? (
				<ErrorState
					message="Could not load this document."
					onRetry={() => detailQuery.refetch()}
					retrying={detailQuery.isFetching}
				/>
			) : !detail || !pr ? (
				<EmptyState
					title="This document does not exist"
					action={
						<Link
							href="/purchase-orders"
							className="text-[13px] font-medium text-brand-accent hover:underline"
						>
							Back to purchase orders
						</Link>
					}
				/>
			) : (
				<div className="flex min-w-0 flex-col gap-4">
					<PrDetailHeader pr={pr} lines={lines} />
					<PrDocumentFlow pr={pr} linkedPos={detail.linkedPos} />

					<Card>
						<CardHeader className="gap-3">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div>
									<CardTitle>PR lines</CardTitle>
									<p className="text-xs text-muted-foreground">
										{pendingLines(lines).length} pending line
										{pendingLines(lines).length === 1 ? "" : "s"}.
									</p>
								</div>

								<div className="flex flex-wrap gap-2">
									{supplierGroups(lines).map((supplier) => (
										<Button
											key={supplier.id}
											type="button"
											variant="outline"
											onClick={() => selectSupplierGroup(supplier.id)}
										>
											{supplier.name} · {supplier.count}
										</Button>
									))}
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<LinesTable
								lines={lines}
								selectedLineIds={selectedLineIds}
								onToggleLine={toggleLine}
								disabled={!canManagePO}
								onCancelLine={canCancelLines ? setCancelLine : undefined}
							/>

							{canManagePO ? (
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-xs text-muted-foreground">
										{selectedLineIds.size} selected
									</p>
									<Button
										type="button"
										disabled={selectedLines.length === 0}
										onClick={() => setCreateOpen(true)}
									>
										<IconFileInvoice className="size-3.5" />
										Create PO ({selectedLines.length})
									</Button>
								</div>
							) : null}
						</CardContent>
					</Card>

					<LinkedPOs
						linkedPos={detail.linkedPos}
						prId={pr.id}
						pendingLines={pendingLines(lines)}
					/>
				</div>
			)}

			{cancelLine && pr ? (
				<CancelPrLineDialog
					prId={pr.id}
					lineId={cancelLine.id}
					itemName={cancelLine.itemName ?? "line"}
					open={cancelLine !== null}
					onOpenChange={(open) => {
						if (!open) setCancelLine(null);
					}}
				/>
			) : null}

			{createOpen && pr ? (
				<CreatePOModal
					pr={pr}
					lines={selectedLines}
					open={createOpen}
					onOpenChange={setCreateOpen}
					onCreated={() => {
						setSelectedLineIds(new Set());
						setCreateOpen(false);
					}}
				/>
			) : null}
		</div>
	);
}

function PrDetailHeader({
	pr,
	lines,
}: {
	pr: PurchaseRequisition;
	lines: PurchaseRequisitionItem[];
}) {
	const pendingCount = pendingLines(lines).length;
	return (
		<DetailHeader
			docNo={pr.prNumber}
			title={`${pendingCount} pending line${pendingCount === 1 ? "" : "s"}`}
			status={<StatusBadge doc="pr" status={pr.status} />}
			backHref="/purchase-orders"
			backLabel="purchase orders"
			meta={[
				{
					label: "Raised by",
					value: pr.requestedByName ?? `#${pr.requestedBy}`,
				},
				{ label: "Date", value: formatDate(pr.createdAt) },
				{ label: "Est. value", value: formatMoney(pr.estimatedAmountPaise) },
				{ label: "Lines", value: String(lines.length) },
			]}
		/>
	);
}

// PR -> PO -> GRN chain from data already on the page (no extra request).
const RECEIVED_PO_STATUSES = new Set([
	"partial_received",
	"fully_received",
	"invoiced",
	"closed",
]);

function PrDocumentFlow({
	pr,
	linkedPos,
}: {
	pr: PurchaseRequisition;
	linkedPos: PRLinkedPo[];
}) {
	const livePos = linkedPos.filter((po) => po.status !== "cancelled");
	const firstPo = livePos[0];
	const received = livePos.some((po) => RECEIVED_PO_STATUSES.has(po.status));
	return (
		<DocumentFlow
			steps={[
				{
					label: "Requisition",
					docNo: pr.prNumber,
					status: <StatusBadge doc="pr" status={pr.status} />,
					state: "done",
				},
				{
					label: "Purchase order",
					docNo: firstPo
						? livePos.length > 1
							? `${firstPo.poNumber} +${livePos.length - 1}`
							: firstPo.poNumber
						: undefined,
					status: firstPo ? (
						<StatusBadge doc="po" status={firstPo.status} />
					) : undefined,
					state: "current",
				},
				{
					label: "Goods receipt",
					status: received ? <span>Received</span> : undefined,
					state: received ? "done" : "todo",
				},
			]}
		/>
	);
}

function LinesTable({
	lines,
	selectedLineIds,
	onToggleLine,
	disabled,
	onCancelLine,
}: {
	lines: PurchaseRequisitionItem[];
	selectedLineIds: Set<number>;
	onToggleLine: (lineId: number, checked: boolean) => void;
	disabled?: boolean;
	onCancelLine?: (line: PurchaseRequisitionItem) => void;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-10" />
					<TableHead>Item</TableHead>
					<TableHead className="text-right">Qty</TableHead>
					<TableHead>Default supplier</TableHead>
					<TableHead className="text-right">Est rate</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>PO</TableHead>
					{onCancelLine ? <TableHead className="w-24" /> : null}
				</TableRow>
			</TableHeader>
			<TableBody>
				{lines.map((line) => {
					const isPending = line.status === "pending";
					return (
						<TableRow key={line.id}>
							<TableCell>
								<Checkbox
									checked={selectedLineIds.has(line.id)}
									disabled={!isPending || disabled}
									onCheckedChange={(checked) =>
										onToggleLine(line.id, checked === true)
									}
									aria-label={`Select ${line.itemName ?? "line"}`}
								/>
							</TableCell>
							<TableCell>
								<div className="flex flex-col">
									<span className="font-medium">{line.itemName ?? "-"}</span>
									<span className="text-muted-foreground">
										{line.itemSku ?? line.itemCategory ?? "-"}
									</span>
								</div>
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{line.requestedQty} {line.uom ?? ""}
							</TableCell>
							<TableCell>{line.defaultSupplierName ?? "No history"}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMoney(line.estRatePaise)}
							</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									className={statusBadgeClass(line.status ?? "pending")}
								>
									{humanizeStatusLabel(line.status)}
								</Badge>
							</TableCell>
							<TableCell>{line.linkedPoNumber ?? "-"}</TableCell>
							{onCancelLine ? (
								<TableCell>
									{isPending ? (
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() => onCancelLine(line)}
										>
											Cancel line
										</Button>
									) : null}
								</TableCell>
							) : null}
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

type LinkedPoDialogState =
	| { type: "send" | "reminder" | "escalate"; poId: number; poNumber: string }
	| { type: "delay"; poId: number; poNumber: string }
	| { type: "confirm"; poId: number; poNumber: string }
	| { type: "invoice"; poId: number; poNumber: string }
	| { type: "cancel" | "close" | "shortClose"; poId: number; poNumber: string };

function LinkedPOs({
	linkedPos,
	prId,
	pendingLines,
}: {
	linkedPos: PRLinkedPo[];
	prId: number;
	pendingLines: PurchaseRequisitionItem[];
}) {
	const canManagePO = useCan("po.manage");
	const canEditGrnDraft = useCan("grn.edit_draft");
	const [editingPoId, setEditingPoId] = useState<number | null>(null);
	const [receivingPoId, setReceivingPoId] = useState<number | null>(null);
	const [dialogState, setDialogState] = useState<LinkedPoDialogState | null>(
		null,
	);
	const flashKeys = useOwnActionStatuses(linkedPos);

	return (
		<Card>
			<CardHeader>
				<CardTitle>POs from this PR</CardTitle>
			</CardHeader>
			<CardContent>
				{linkedPos.length === 0 ? (
					<p className="py-4 text-center text-xs text-muted-foreground">
						No POs created from this PR yet.
					</p>
				) : (
					<div className="space-y-2">
						{linkedPos.map((po) => (
							<div key={po.id} className="space-y-2">
								<StatusFlashRow
									as="div"
									flashKey={flashKeys[po.id]}
									className="flex flex-col gap-2 rounded-md border p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono font-medium">{po.poNumber}</span>
										<span className="text-muted-foreground">
											Supplier #{po.supplierId}
										</span>
										<StatusBadge doc="po" status={po.status} />
										<span className="tabular-nums">
											{formatMoney(po.totalAmountPaise)}
										</span>
									</div>

									<div className="flex flex-wrap gap-2">
										{!canManagePO ? null : po.status === "draft" ? (
											<>
												<SubmitPOForApprovalButton poId={po.id} prId={prId} />
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => setEditingPoId(po.id)}
												>
													Edit
												</Button>
											</>
										) : !PO_TERMINAL_STATUSES.has(po.status) ? (
											<>
												{po.status === "approved" ? (
													<Button
														type="button"
														size="sm"
														onClick={() =>
															setDialogState({
																type: "send",
																poId: po.id,
																poNumber: po.poNumber,
															})
														}
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
																setDialogState({
																	type: "reminder",
																	poId: po.id,
																	poNumber: po.poNumber,
																})
															}
														>
															Reminder
														</Button>
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() =>
																setDialogState({
																	type: "escalate",
																	poId: po.id,
																	poNumber: po.poNumber,
																})
															}
														>
															Escalate
														</Button>
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() =>
																setDialogState({
																	type: "delay",
																	poId: po.id,
																	poNumber: po.poNumber,
																})
															}
														>
															Delay
														</Button>
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() =>
																setDialogState({
																	type: "confirm",
																	poId: po.id,
																	poNumber: po.poNumber,
																})
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
														onClick={() =>
															setDialogState({
																type: "invoice",
																poId: po.id,
																poNumber: po.poNumber,
															})
														}
													>
														Mark Invoiced
													</Button>
												) : null}
											</>
										) : null}
										{canManagePO ? (
											<PoMoreMenu
												poNumber={po.poNumber}
												status={po.status}
												onSelect={(type) =>
													setDialogState({
														type,
														poId: po.id,
														poNumber: po.poNumber,
													})
												}
											/>
										) : null}
										{/* Independent of canManagePO: grn.edit_draft holders are authorized by
									the backend to create/manage GRN drafts (creategrn, bypass) even
									though they can't manage the PO itself — never nest this inside
									the canManagePO-gated block above. */}
										{PO_IN_TRANSIT_STATUSES.has(po.status) &&
										canEditGrnDraft ? (
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() => setReceivingPoId(po.id)}
											>
												Receive goods
											</Button>
										) : null}
									</div>
								</StatusFlashRow>
								<PoApprovalHistory poId={po.id} />
								<PoDetails poId={po.id} />
							</div>
						))}
					</div>
				)}
			</CardContent>

			{editingPoId ? (
				<EditPOModal
					poId={editingPoId}
					prId={prId}
					pendingLines={pendingLines}
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
					poId={dialogState.poId}
					prId={prId}
					poNumber={dialogState.poNumber}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onLogged={() => setDialogState(null)}
				/>
			) : null}

			{dialogState?.type === "delay" ? (
				<DelayPoDialog
					po={{ id: dialogState.poId, poNumber: dialogState.poNumber }}
					prId={prId}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onUpdated={() => setDialogState(null)}
				/>
			) : null}

			{dialogState?.type === "confirm" ? (
				<ConfirmPoDialog
					poId={dialogState.poId}
					poNumber={dialogState.poNumber}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onConfirmed={() => setDialogState(null)}
				/>
			) : null}

			{dialogState?.type === "cancel" ? (
				<CancelPOAlert
					poId={dialogState.poId}
					prId={prId}
					poNumber={dialogState.poNumber}
					open
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
				/>
			) : null}

			{dialogState?.type === "close" ? (
				<ClosePoAlert
					poId={dialogState.poId}
					poNumber={dialogState.poNumber}
					open
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
				/>
			) : null}

			{dialogState?.type === "shortClose" ? (
				<ShortClosePoAlert
					poId={dialogState.poId}
					poNumber={dialogState.poNumber}
					open
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
				/>
			) : null}

			{dialogState?.type === "invoice" ? (
				<MarkPoInvoicedDialog
					poId={dialogState.poId}
					poNumber={dialogState.poNumber}
					open={dialogState !== null}
					onOpenChange={(open) => {
						if (!open) setDialogState(null);
					}}
					onInvoiced={() => setDialogState(null)}
				/>
			) : null}
		</Card>
	);
}

type MoreAction = "cancel" | "close" | "shortClose";

/** Destructive actions live in one "More" menu; each opens a confirm dialog naming the PO (BR-DS-08). */
function PoMoreMenu({
	poNumber,
	status,
	onSelect,
}: {
	poNumber: string;
	status: POStatus;
	onSelect: (action: MoreAction) => void;
}) {
	const items: { action: MoreAction; label: string }[] = [];
	if (canClosePurchaseOrder(status))
		items.push({ action: "close", label: "Close PO" });
	if (canShortClosePurchaseOrder(status))
		items.push({ action: "shortClose", label: "Short-close" });
	if (canCancelPurchaseOrder(status))
		items.push({ action: "cancel", label: "Cancel PO" });
	if (items.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="outline"
					aria-label={`More actions for ${poNumber}`}
				>
					<IconDots className="size-3.5" />
					More
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{items.map((item) => (
					<DropdownMenuItem
						key={item.action}
						variant={item.action === "cancel" ? "destructive" : undefined}
						onSelect={() => onSelect(item.action)}
					>
						{item.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Status per PO that only moves after an action by this user on this page, so the row
 * flashes for the user's own change and never for a refetch or someone else's (BR-DS-12).
 */
function useOwnActionStatuses(linkedPos: PRLinkedPo[]) {
	const queryClient = useQueryClient();
	const armed = useRef(false);
	const [own, setOwn] = useState<Record<number, string>>({});

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
			if (
				event.type === "updated" &&
				event.mutation.state.status === "success"
			) {
				armed.current = true;
				clearTimeout(timer);
				timer = setTimeout(() => {
					armed.current = false;
				}, 10_000);
			}
		});
		return () => {
			unsubscribe();
			clearTimeout(timer);
		};
	}, [queryClient]);

	useEffect(() => {
		setOwn((current) => {
			let next = current;
			for (const po of linkedPos) {
				if (current[po.id] === undefined || armed.current) {
					if (current[po.id] !== po.status) {
						if (next === current) next = { ...current };
						next[po.id] = po.status;
					}
				}
			}
			return next;
		});
	}, [linkedPos]);

	return own;
}

function PoDetails({ poId }: { poId: number }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="space-y-2 px-1">
			<Button
				type="button"
				size="sm"
				variant="ghost"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				{open ? "Hide details" : "Details, GST and log"}
			</Button>
			{open ? <PoDetailPanel poId={poId} /> : null}
		</div>
	);
}

function PoApprovalHistory({ poId }: { poId: number }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="space-y-2 px-1">
			<Button
				type="button"
				size="sm"
				variant="ghost"
				onClick={() => setOpen((value) => !value)}
			>
				{open ? "Hide approval history" : "Approval history"}
			</Button>
			{open ? <ApprovalHistoryPanel docType="po" docId={poId} /> : null}
		</div>
	);
}

function SubmitPOForApprovalButton({
	poId,
	prId,
}: {
	poId: number;
	prId: number;
}) {
	const queryClient = useQueryClient();
	const mutation = useSubmitApprovalRequestMutation();

	return (
		<Button
			type="button"
			size="sm"
			disabled={mutation.isPending}
			onClick={() =>
				mutation.mutate(
					{ docType: "po", docId: poId },
					{
						onSuccess: (result) => {
							if (!result.success) return;
							queryClient.invalidateQueries({
								queryKey: purchaseRequisitionKeys.detail(prId),
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

function CancelPOAlert({
	poId,
	prId,
	poNumber,
	open,
	onOpenChange,
}: {
	poId: number;
	prId: number;
	poNumber: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [reason, setReason] = useState("");
	const mutation = useCancelPurchaseOrderMutation();
	const trimmed = reason.trim();

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange?.(next);
				if (!next) setReason("");
			}}
		>
			{open === undefined ? (
				<AlertDialogTrigger asChild>
					<Button type="button" size="sm" variant="outline">
						Cancel
					</Button>
				</AlertDialogTrigger>
			) : null}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Cancel {poNumber}?</AlertDialogTitle>
					<AlertDialogDescription>
						Its PR lines are cancelled too, so a new PR is needed to order
						again. A reason is required.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Label htmlFor={`po-cancel-reason-${poId}`}>Reason</Label>
				<Textarea
					id={`po-cancel-reason-${poId}`}
					value={reason}
					maxLength={PO_REASON_MAX}
					onChange={(event) => setReason(event.target.value)}
					placeholder={`Reason for cancellation (at least ${PO_REASON_MIN} characters)`}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={trimmed.length < PO_REASON_MIN || mutation.isPending}
						onClick={() => mutation.mutate({ poId, prId, reason: trimmed })}
					>
						Cancel PO
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function CreatePOModal({
	pr,
	lines,
	open,
	onOpenChange,
	onCreated,
}: {
	pr: PurchaseRequisition;
	lines: PurchaseRequisitionItem[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const sharedDefaultSupplierId = sameDefaultSupplier(lines);
	const [supplierSearch, setSupplierSearch] = useState("");
	const [supplierId, setSupplierId] = useState<number | undefined>(
		sharedDefaultSupplierId,
	);
	// null = not typed yet, so the supplier's default terms show (BR-PO-23).
	const [paymentTermsDays, setPaymentTermsDays] = useState<string | null>(null);
	const [gsts, setGsts] = useState<Record<number, string>>({});
	const [deliveryTerms, setDeliveryTerms] = useState("");
	const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
	const [notes, setNotes] = useState("");
	const [rates, setRates] = useState<Record<number, string>>(() =>
		Object.fromEntries(
			lines.map((line) => [line.id, String((line.estRatePaise ?? 0) / 100)]),
		),
	);
	const suppliersQuery = useSuppliersQuery({
		page: 1,
		pageSize: 20,
		sortBy: "name",
		sortDir: "asc",
		q: supplierSearch || undefined,
	});
	const supplierItemsQuery = useSupplierItemsQuery(
		supplierId ?? 0,
		{ page: 1, pageSize: 100 },
		Boolean(supplierId),
	);
	const supplierDetailQuery = useSupplierDetailQuery(supplierId ?? 0);
	const supplierDefaultTerms = supplierDetailQuery.data?.success
		? supplierDetailQuery.data.data.supplier.defaultPaymentTermsDays
		: null;
	const termsValue =
		paymentTermsDays ??
		(supplierDefaultTerms != null ? String(supplierDefaultTerms) : "");
	const catalogRateByItemId = useMemo(() => {
		const map = new Map<number, number>();
		for (const item of supplierItemsQuery.data?.data ?? []) {
			// Only active price-list rows suggest a rate / GST (BR-PO-03/04).
			if (item.isActive === false) continue;
			map.set(item.itemId, item.supplierUnitPricePaise);
		}
		return map;
	}, [supplierItemsQuery.data?.data]);
	const catalogGstByItemId = useMemo(() => {
		const map = new Map<number, number>();
		for (const item of supplierItemsQuery.data?.data ?? []) {
			if (item.isActive === false || item.taxPercentage == null) continue;
			map.set(item.itemId, item.taxPercentage);
		}
		return map;
	}, [supplierItemsQuery.data?.data]);
	function gstFor(line: PurchaseRequisitionItem) {
		return gsts[line.id] ?? String(catalogGstByItemId.get(line.itemId) ?? 0);
	}
	const createMutation = useCreatePurchaseOrderMutation();

	const defaultSupplierMismatchCount = supplierId
		? lines.filter(
				(line) =>
					line.defaultSupplierId != null &&
					line.defaultSupplierId !== supplierId,
			).length
		: 0;
	const defaultSupplierCount = new Set(
		lines
			.map((line) => line.defaultSupplierId)
			.filter((id): id is number => Boolean(id)),
	).size;
	const supplierOptions = useMemo(
		() =>
			(suppliersQuery.data?.data ?? [])
				// BR-PO-01: inactive suppliers cannot be picked.
				.filter((supplier: Supplier) => supplier.isActive)
				.map((supplier: Supplier) => ({
					value: String(supplier.id),
					label: supplier.name,
					secondaryLabel:
						supplier.defaultPaymentTermsDays != null
							? `${supplier.defaultPaymentTermsDays} day terms`
							: undefined,
				})),
		[suppliersQuery.data?.data],
	);
	const totalPaise = lines.reduce((sum, line) => {
		const rupees = Number(rates[line.id] || 0);
		const value = Math.round(rupees * 100 * line.requestedQty);
		return sum + value + Math.round((value * Number(gstFor(line))) / 100);
	}, 0);

	useEffect(() => {
		if (sharedDefaultSupplierId) {
			setSupplierId(sharedDefaultSupplierId);
		}
	}, [sharedDefaultSupplierId]);

	function onSubmit() {
		if (!supplierId) return;

		createMutation.mutate(
			{
				prId: pr.id,
				payload: toPOCreatePayload({
					supplierId,
					paymentTermsDays: termsValue ? Number(termsValue) : undefined,
					deliveryTerms,
					expectedDeliveryDate,
					notes,
					lines: lines.map((line) => ({
						prItemId: line.id,
						unitPriceRupees: Number(rates[line.id] || 0),
						gstPercent: Number(gstFor(line)),
					})),
				}),
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						onCreated();
					}
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="min-w-[min(56rem,calc(100vw-2rem))] gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>Create PO · {pr.prNumber}</DialogTitle>
					<DialogDescription>
						Negotiated rate is captured per selected PR line.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
					<div className="grid gap-3 md:grid-cols-[1fr_10rem_1fr]">
						<div>
							<span className="mb-1 block text-xs font-medium">Supplier</span>
							<SearchableSelect
								value={supplierId ? String(supplierId) : undefined}
								options={supplierOptions}
								onValueChange={(value) => setSupplierId(Number(value))}
								searchValue={supplierSearch}
								onSearchChange={setSupplierSearch}
								placeholder="Select supplier"
								searchPlaceholder="Search supplier"
								emptyText="No suppliers found"
								isLoading={suppliersQuery.isLoading}
							/>
						</div>
						<div>
							<label
								htmlFor="po-create-payment-terms-days"
								className="mb-1 block text-xs font-medium"
							>
								Terms
							</label>
							<Input
								id="po-create-payment-terms-days"
								type="number"
								min={0}
								max={365}
								value={termsValue}
								onChange={(event) => setPaymentTermsDays(event.target.value)}
							/>
						</div>
						<div>
							<label
								htmlFor="po-create-expected-delivery-date"
								className="mb-1 block text-xs font-medium"
							>
								Delivery date (needed before sending)
							</label>
							<Input
								id="po-create-expected-delivery-date"
								type="date"
								value={expectedDeliveryDate}
								onChange={(event) =>
									setExpectedDeliveryDate(event.target.value)
								}
							/>
						</div>
					</div>

					{!supplierId && defaultSupplierCount > 1 ? (
						<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							Selected lines have {defaultSupplierCount} default suppliers. Pick
							one supplier for this PO, or create separate POs.
						</p>
					) : null}

					{defaultSupplierMismatchCount > 0 ? (
						<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							{defaultSupplierMismatchCount} selected line
							{defaultSupplierMismatchCount === 1 ? "" : "s"} default to another
							supplier.
						</p>
					) : null}

					<div className="space-y-2">
						{lines.map((line) => (
							<CreatePOLine
								key={line.id}
								line={line}
								supplierId={supplierId}
								catalogRatePaise={catalogRateByItemId.get(line.itemId)}
								value={rates[line.id] ?? ""}
								onChange={(value) =>
									setRates((current) => ({ ...current, [line.id]: value }))
								}
								gst={gstFor(line)}
								onGstChange={(value) =>
									setGsts((current) => ({ ...current, [line.id]: value }))
								}
							/>
						))}
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div>
							<label
								htmlFor="po-create-delivery-terms"
								className="mb-1 block text-xs font-medium"
							>
								Delivery terms
							</label>
							<Input
								id="po-create-delivery-terms"
								value={deliveryTerms}
								onChange={(event) => setDeliveryTerms(event.target.value)}
								placeholder="Door delivery, pickup, freight included"
							/>
						</div>
						<div>
							<label
								htmlFor="po-create-notes"
								className="mb-1 block text-xs font-medium"
							>
								Notes
							</label>
							<Textarea
								id="po-create-notes"
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								placeholder="Optional"
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="border-t px-6 py-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={
							!supplierId || lines.length === 0 || createMutation.isPending
						}
						onClick={onSubmit}
					>
						<IconTruckDelivery className="size-3.5" />
						{createMutation.isPending
							? "Saving…"
							: `Create draft PO · ${formatMoney(totalPaise)} incl. GST`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const LAST_RATE_SOURCE_LABEL: Record<LastRateSource, string> = {
	po_history: "last PO",
	supplier_catalog: "catalog",
	pr_estimate: "PR estimate",
};

function CreatePOLine({
	line,
	supplierId,
	catalogRatePaise,
	value,
	onChange,
	gst,
	onGstChange,
}: {
	line: PurchaseRequisitionItem;
	supplierId?: number;
	catalogRatePaise?: number;
	value: string;
	onChange: (value: string) => void;
	gst: string;
	onGstChange: (value: string) => void;
}) {
	// Rate-prefill priority: supplier catalog price (already fetched with the
	// supplier) > PO-history/catalog lookup > PR estimate.
	const lastRateQuery = useItemLastRateQuery(
		line.itemId,
		supplierId ?? 0,
		Boolean(supplierId) && catalogRatePaise == null,
	);
	const lastRate = lastRateQuery.data?.success
		? lastRateQuery.data.data
		: undefined;
	const referenceRate =
		catalogRatePaise != null
			? { ratePaise: catalogRatePaise, label: "catalog" }
			: lastRate
				? {
						ratePaise: lastRate.ratePaise,
						label: LAST_RATE_SOURCE_LABEL[lastRate.source],
					}
				: undefined;
	const isReferenceRateLoading =
		Boolean(supplierId) && catalogRatePaise == null && lastRateQuery.isLoading;
	const referenceRatePaise = referenceRate?.ratePaise;

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	useEffect(() => {
		if (referenceRatePaise == null) return;
		onChangeRef.current(String(referenceRatePaise / 100));
	}, [referenceRatePaise]);

	return (
		<div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_7rem_9rem_8rem_7rem_8rem] md:items-center">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{line.itemName ?? "-"}</span>
					{supplierId &&
					line.defaultSupplierId &&
					line.defaultSupplierId !== supplierId ? (
						<Badge
							variant="outline"
							className="border-amber-200 bg-amber-100 text-amber-800"
						>
							default: {line.defaultSupplierName}
						</Badge>
					) : null}
				</div>
				<p className="text-xs text-muted-foreground">
					{line.requestedQty} {line.uom ?? ""}
				</p>
			</div>

			<div className="text-xs text-muted-foreground">
				<p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
					Item rate
				</p>
				<p>{formatMoney(line.estRatePaise)}</p>
			</div>

			<div className="text-xs text-muted-foreground">
				<p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
					Last rate
				</p>
				<p>
					{!supplierId
						? "Pick a supplier"
						: isReferenceRateLoading
							? "Loading…"
							: referenceRate
								? `${formatMoney(referenceRate.ratePaise)} · ${referenceRate.label}`
								: "No history"}
				</p>
			</div>

			<div>
				<label
					htmlFor={`po-create-line-rate-${line.id}`}
					className="mb-1 block text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase"
				>
					Negotiated rate
				</label>
				<div className="relative">
					<IconCurrencyRupee className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						id={`po-create-line-rate-${line.id}`}
						type="number"
						min={0}
						step={1}
						value={value}
						onChange={(event) => onChange(event.target.value)}
						className="pl-7 text-right tabular-nums"
					/>
				</div>
			</div>

			<div>
				<Label
					htmlFor={`po-create-line-gst-${line.id}`}
					className="mb-1 block text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase"
				>
					GST %
				</Label>
				<Select value={gst} onValueChange={onGstChange}>
					<SelectTrigger
						id={`po-create-line-gst-${line.id}`}
						className="w-full"
					>
						<SelectValue placeholder="GST %" />
					</SelectTrigger>
					<SelectContent>
						{GST_PERCENT_VALUES.map((value) => (
							<SelectItem key={value} value={String(value)}>
								{value}%
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="text-right font-medium tabular-nums">
				<p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
					Total
				</p>
				{formatMoney(Math.round(Number(value || 0) * 100 * line.requestedQty))}
			</div>
		</div>
	);
}

function DetailSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-96 w-full" />
			<Skeleton className="h-40 w-full" />
		</div>
	);
}
