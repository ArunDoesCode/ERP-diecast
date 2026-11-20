"use client";

import Link from "next/link";
import { useState } from "react";

import {
	DOC_TYPE_LABEL,
	documentPageHref,
	roleLabel,
} from "@/components/pages/approval/approval-labels";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalDocumentView } from "@/lib/api/approval/document-view-types";
import {
	useActOnApprovalRequestMutation,
	useApprovalDocumentViewQuery,
} from "@/lib/api/approval/queries";
import { ApiClientError } from "@/lib/api/client";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatQty,
} from "@/lib/format";
import type { ApprovalDocType } from "@/types/approval";

type PreviewLine = {
	key: number;
	name: string;
	qty: string;
	ratePaise: number | null;
	amountPaise: number | null;
};

type Preview = {
	number: string;
	createdAt: string | null;
	requesterName: string | null;
	totalPaise: number | null;
	lines: PreviewLine[];
};

function lineAmount(qty: number, ratePaise: number | undefined) {
	return ratePaise === undefined ? null : Math.round(qty * ratePaise);
}

function toPreview(
	docType: ApprovalDocType,
	view: ApprovalDocumentView,
): Preview {
	if (docType === "pr" && view.pr) {
		return {
			number: view.pr.prNumber,
			createdAt: view.pr.createdAt,
			requesterName: view.pr.requestedByName ?? null,
			totalPaise: view.pr.estimatedAmountPaise ?? null,
			lines: (view.items ?? []).map((item) => {
				const it = item as unknown as {
					id: number;
					itemName?: string | null;
					itemSku?: string | null;
					requestedQty: number;
					uom: string | null;
					estRatePaise?: number;
				};
				return {
					key: it.id,
					name: it.itemName || it.itemSku || "–",
					qty: formatQty(it.requestedQty, it.uom, 0),
					ratePaise: it.estRatePaise ?? null,
					amountPaise: lineAmount(it.requestedQty, it.estRatePaise),
				};
			}),
		};
	}
	if (docType === "po" && view.po) {
		return {
			number: view.po.poNumber,
			createdAt: view.po.createdAt,
			requesterName: null,
			totalPaise: view.po.totalAmountPaise,
			lines: (view.items ?? []).map((item) => {
				const it = item as unknown as {
					id: number;
					itemName?: string;
					itemSku?: string;
					qty: number;
					uom: string | null;
					unitPricePaise: number;
					lineValuePaise?: number;
				};
				return {
					key: it.id,
					name: it.itemName || it.itemSku || "–",
					qty: formatQty(it.qty, it.uom, 0),
					ratePaise: it.unitPricePaise,
					amountPaise:
						it.lineValuePaise ?? lineAmount(it.qty, it.unitPricePaise),
				};
			}),
		};
	}
	const sco = view.sco;
	return {
		number: sco?.scoNumber ?? "–",
		createdAt: sco?.createdAt ?? null,
		requesterName: null,
		totalPaise: sco?.totalAmountPaise ?? null,
		lines: (view.items ?? []).map((item) => {
			const it = item as unknown as {
				id: number;
				serviceDescription: string;
				rawItemName: string;
				rawQtyToIssue: number;
				rawItemUom: string;
				serviceUnitPricePaise: number;
				lineValuePaise: number;
			};
			return {
				key: it.id,
				name: `${it.serviceDescription} (${it.rawItemName})`,
				qty: formatQty(it.rawQtyToIssue, it.rawItemUom, 0),
				ratePaise: it.serviceUnitPricePaise,
				amountPaise: it.lineValuePaise,
			};
		}),
	};
}

type ApprovalPreviewPaneProps = {
	docType: ApprovalDocType;
	docId: number;
	/** Called after an action went through or the request turned out to be handled already. */
	onActed: () => void;
};

export function ApprovalPreviewPane({
	docType,
	docId,
	onActed,
}: ApprovalPreviewPaneProps) {
	const query = useApprovalDocumentViewQuery(docType, docId);
	const actMutation = useActOnApprovalRequestMutation();
	const [note, setNote] = useState("");
	const [noteError, setNoteError] = useState<string | null>(null);
	const [rejectOpen, setRejectOpen] = useState(false);
	const [handled, setHandled] = useState(false);

	if (query.isLoading) {
		return (
			<div className="space-y-3" aria-busy="true">
				<Skeleton className="h-6 w-1/2" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		);
	}

	if (query.isError) {
		const forbidden =
			query.error instanceof ApiClientError && query.error.status === 403;
		return forbidden ? (
			<p
				role="alert"
				className="py-10 text-center text-sm text-muted-foreground"
			>
				You do not have access to this document
			</p>
		) : (
			<ErrorState
				message="Could not load this document."
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}

	const view = query.data?.success ? query.data.data : null;
	if (!view) {
		return (
			<ErrorState
				message="Could not load this document."
				onRetry={() => {
					void query.refetch();
				}}
			/>
		);
	}

	const preview = toPreview(docType, view);
	const request = view.request;
	const requesterName = request?.requesterName ?? preview.requesterName ?? "–";
	const waitingFor = request
		? roleLabel(request.currentApproverRole) ||
			(request.currentApproverEmployeeId ? "a named approver" : "")
		: "";
	const showActions = view.canAct && request !== null && !handled;
	const noteId = `approval-preview-note-${docType}-${docId}`;

	function act(action: "approve" | "reject" | "sent_back") {
		if (!request) return;
		const typed = note.trim();
		if (typed.length === 0) {
			setNoteError("Type a note before you continue.");
			return;
		}
		setNoteError(null);
		actMutation.mutate(
			{ id: request.id, input: { action, notes: typed } },
			{
				onSuccess: () => {
					setRejectOpen(false);
					setNote("");
					onActed();
				},
				onError: (error) => {
					setRejectOpen(false);
					if (
						error instanceof ApiClientError &&
						(error.code === "APPROVAL_NOT_PENDING" ||
							error.code === "APPROVAL_ALREADY_ACTED")
					) {
						// BR-FF-84: someone else got there first.
						setHandled(true);
						onActed();
					}
				},
			},
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<h2 className="font-mono text-base font-semibold">
						{preview.number}
					</h2>
					<StatusBadge
						doc="approval"
						status={request?.status ?? "pending_approval"}
					/>
				</div>
				<Link
					href={documentPageHref(docType, docId)}
					className="text-sm text-brand-accent hover:underline"
				>
					Open full page ›
				</Link>
			</div>

			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">Requester</dt>
				<dd>{requesterName}</dd>
				<dt className="text-muted-foreground">Date</dt>
				<dd>{formatDate(preview.createdAt)}</dd>
				<dt className="text-muted-foreground">Type</dt>
				<dd>{DOC_TYPE_LABEL[docType]}</dd>
				{request ? (
					<>
						<dt className="text-muted-foreground">Level</dt>
						<dd>
							{request.currentLevel} of {request.totalLevels}
							{waitingFor ? ` · waiting for ${waitingFor}` : ""}
						</dd>
					</>
				) : null}
			</dl>

			{view.requesterNote ? (
				<p className="rounded-md bg-muted p-3 text-sm">
					<span className="text-muted-foreground">Requester note: </span>
					{view.requesterNote}
				</p>
			) : null}

			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b text-left text-muted-foreground">
							<th scope="col" className="py-1 pr-2 font-medium">
								Item
							</th>
							<th scope="col" className="py-1 pr-2 text-right font-medium">
								Qty
							</th>
							<th scope="col" className="py-1 pr-2 text-right font-medium">
								Rate
							</th>
							<th scope="col" className="py-1 text-right font-medium">
								Amount
							</th>
						</tr>
					</thead>
					<tbody>
						{preview.lines.map((line) => (
							<tr key={line.key} className="border-b last:border-0">
								<td className="py-1 pr-2">{line.name}</td>
								<td className="py-1 pr-2 text-right tabular-nums">
									{line.qty}
								</td>
								<td className="py-1 pr-2 text-right tabular-nums">
									{formatMoney(line.ratePaise)}
								</td>
								<td className="py-1 text-right tabular-nums">
									{formatMoney(line.amountPaise)}
								</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<th
								scope="row"
								colSpan={3}
								className="py-2 pr-2 text-right font-medium"
							>
								Total
							</th>
							<td className="py-2 text-right font-semibold tabular-nums">
								{formatMoney(preview.totalPaise)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>

			<section aria-label="Approval trail" className="space-y-1">
				<h3 className="text-sm font-medium">Approval trail</h3>
				{view.trail.length === 0 ? (
					<p className="text-sm text-muted-foreground">No actions yet.</p>
				) : (
					<ol className="space-y-1 border-l pl-3 text-sm">
						{view.trail.map((entry) => (
							<li key={entry.id}>
								<span className="font-medium">
									{roleLabel(
										entry.action === "require_more_info"
											? "sent back"
											: entry.action,
									)}
								</span>{" "}
								by {entry.actorName} · {formatDateTime(entry.actionAt)}
								{entry.notes ? (
									<p className="text-muted-foreground">“{entry.notes}”</p>
								) : null}
							</li>
						))}
					</ol>
				)}
			</section>

			{handled ? (
				<output className="block text-sm text-muted-foreground">
					This request was already handled. The list has been refreshed.
				</output>
			) : null}

			{showActions ? (
				<div className="space-y-2">
					<Label htmlFor={noteId}>Note (required)</Label>
					<Textarea
						id={noteId}
						value={note}
						maxLength={1000}
						aria-invalid={noteError ? true : undefined}
						aria-describedby={noteError ? `${noteId}-error` : undefined}
						onChange={(event) => {
							setNote(event.target.value);
							if (noteError) setNoteError(null);
						}}
						placeholder="Type your note"
					/>
					{noteError ? (
						<p
							id={`${noteId}-error`}
							role="alert"
							className="text-sm text-destructive"
						>
							{noteError}
						</p>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							disabled={actMutation.isPending}
							onClick={() => act("approve")}
						>
							Approve
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={actMutation.isPending}
							onClick={() => act("sent_back")}
						>
							Send back
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={actMutation.isPending}
							onClick={() => {
								if (note.trim().length === 0) {
									setNoteError("Type a note before you continue.");
									return;
								}
								setRejectOpen(true);
							}}
						>
							Reject
						</Button>
					</div>
				</div>
			) : null}

			<AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reject {preview.number}?</AlertDialogTitle>
						<AlertDialogDescription>
							Rejecting closes this request for good. The requester is told with
							your note and must start a new request.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<Button
							type="button"
							variant="destructive"
							disabled={actMutation.isPending}
							onClick={() => act("reject")}
						>
							Reject
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
