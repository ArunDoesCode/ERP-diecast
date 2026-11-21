"use client";

import { useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	prtErrorMessage,
	useCancelPostedReturnMutation,
	useCancelReturnDraftMutation,
	usePostReturnMutation,
} from "@/lib/api/purchase-return/queries";
import { formatMoney, formatQtyTrim } from "@/lib/format";
import {
	PRT_REASON_MAX,
	PRT_REASON_MIN,
	type PrtDetail,
} from "@/types/purchase-return";

export type ReturnDialog = "post" | "cancelDraft" | "cancelPosted";

function ErrorBox({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<div
			role="alert"
			className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
		>
			{message}
		</div>
	);
}

/** "Stock −30 kg ADC12, debit note ₹7,434" for the confirm text. */
function impactText(prt: PrtDetail) {
	const preview = prt.preview;
	if (!preview) return "";
	const parts = preview.stockOut.map((entry) => {
		const name =
			prt.lines.find((line) => line.itemId === entry.itemId)?.itemName ?? "";
		return `Stock −${formatQtyTrim(entry.qty, entry.uom)} ${name}`.trim();
	});
	if (parts.length === 0) parts.push("No stock movement");
	parts.push(`debit note ${formatMoney(preview.debitNoteTotalPaise)}`);
	return parts.join(", ");
}

export function ReturnActionDialogs({
	prt,
	open,
	onClose,
}: {
	prt: PrtDetail;
	open: ReturnDialog | null;
	onClose: () => void;
}) {
	const post = usePostReturnMutation(prt.id);
	const cancelDraft = useCancelReturnDraftMutation(prt.id);
	const cancelPosted = useCancelPostedReturnMutation(prt.id);
	const [error, setError] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();
	const reasonValid =
		trimmed.length >= PRT_REASON_MIN && trimmed.length <= PRT_REASON_MAX;

	function close(next: boolean) {
		if (!next) {
			setError(null);
			setReason("");
			onClose();
		}
	}
	const fail = (fallback: string) => (err: unknown) =>
		setError(prtErrorMessage(err, fallback));

	return (
		<>
			<AlertDialog open={open === "post"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Post {prt.proNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							{impactText(prt)}. A debit note and a return challan are made.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "post" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={post.isPending}>
							Keep draft
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={post.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								post.mutate(undefined, {
									onSuccess: () => close(false),
									onError: fail("Could not post the return."),
								});
							}}
						>
							{post.isPending ? "Posting…" : "Post return"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "cancelDraft"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancel draft {prt.proNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							The draft is cancelled for good. Nothing has moved yet, so stock
							and the PO stay as they are.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "cancelDraft" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={cancelDraft.isPending}>
							Keep draft
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={cancelDraft.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								cancelDraft.mutate(undefined, {
									onSuccess: () => close(false),
									onError: fail("Could not cancel the draft."),
								});
							}}
						>
							{cancelDraft.isPending ? "Cancelling…" : "Cancel draft"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "cancelPosted"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancel return {prt.proNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							Accepted stock comes back into the plant and the debit note
							{prt.debitNote ? ` ${prt.debitNote.dnNumber}` : ""} is marked
							cancelled.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="prt-cancel-reason">Reason *</Label>
						<Textarea
							id="prt-cancel-reason"
							value={reason}
							maxLength={PRT_REASON_MAX}
							onChange={(event) => setReason(event.target.value)}
						/>
						<p className="text-right text-[13px] text-muted-foreground tabular-nums">
							{reason.length} / {PRT_REASON_MAX}
						</p>
					</div>
					<ErrorBox message={open === "cancelPosted" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={cancelPosted.isPending}>
							Keep return
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={!reasonValid || cancelPosted.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								cancelPosted.mutate(
									{ reason: trimmed },
									{
										onSuccess: () => close(false),
										onError: fail("Could not cancel the return."),
									},
								);
							}}
						>
							{cancelPosted.isPending ? "Cancelling…" : "Cancel return"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
