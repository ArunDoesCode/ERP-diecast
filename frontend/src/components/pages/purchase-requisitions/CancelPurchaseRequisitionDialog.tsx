"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/client";
import { useDeletePurchaseRequisitionMutation } from "@/lib/api/purchase-requisitions/queries";
import {
	PR_CANCEL_REASON_MAX,
	PR_CANCEL_REASON_MIN,
	type PRStatus,
	type PurchaseRequisitionItem,
} from "@/types/purchase-requisitions";

const CANCELLABLE: PRStatus[] = ["draft", "pending_approval", "approved"];

/** Returns a hint when Cancel PR must be disabled (BR-PR-39), else null. */
export function getCancelBlockedReason(
	status: PRStatus,
	items: PurchaseRequisitionItem[],
) {
	if (!CANCELLABLE.includes(status)) {
		return "Only draft, pending approval or approved PRs can be cancelled.";
	}
	if (items.some((item) => item.linkedPoId != null)) {
		return "A line is on a purchase order. Cancel the PO first.";
	}
	return null;
}

const ERROR_MESSAGES: Record<string, string> = {
	PR_CANCEL_REASON_REQUIRED: `Enter a reason of ${PR_CANCEL_REASON_MIN} to ${PR_CANCEL_REASON_MAX} characters.`,
	PR_INVALID_TRANSITION:
		"This PR can no longer be cancelled (it is already rejected or cancelled).",
	PR_NOT_FOUND: "This PR no longer exists.",
	INVALID_PR_ID: "This PR id is not valid.",
	PERMISSION_DENIED: "You do not have permission to cancel this PR.",
};

function toMessage(error: unknown) {
	if (error instanceof ApiClientError) {
		// PR_HAS_ORDERED_LINES etc: the backend message already names the POs.
		if (error.code && ERROR_MESSAGES[error.code]) {
			return ERROR_MESSAGES[error.code];
		}
		return error.message;
	}
	return "Could not cancel the PR. Try again.";
}

export function CancelPurchaseRequisitionDialog({
	prId,
	prNumber,
	open,
	onOpenChange,
	onCancelled,
}: {
	prId: number;
	prNumber: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCancelled?: () => void;
}) {
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useDeletePurchaseRequisitionMutation();

	const trimmed = reason.trim();
	const valid =
		trimmed.length >= PR_CANCEL_REASON_MIN &&
		trimmed.length <= PR_CANCEL_REASON_MAX;

	function handleOpenChange(next: boolean) {
		if (mutation.isPending) return;
		if (!next) {
			setReason("");
			setError(null);
		}
		onOpenChange(next);
	}

	function onConfirm() {
		if (!valid) {
			setError(ERROR_MESSAGES.PR_CANCEL_REASON_REQUIRED);
			return;
		}
		setError(null);
		mutation.mutate(
			{ prId, reason: trimmed },
			{
				onSuccess: (result) => {
					if (!result.success) {
						setError(result.message || "Could not cancel the PR.");
						return;
					}
					setReason("");
					onOpenChange(false);
					onCancelled?.();
				},
				onError: (err) => setError(toMessage(err)),
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Cancel PR {prNumber}</DialogTitle>
					<DialogDescription>
						This cannot be undone. The PR keeps its number and becomes
						read-only.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="pr-cancel-reason">Reason</Label>
					<Textarea
						id="pr-cancel-reason"
						value={reason}
						maxLength={PR_CANCEL_REASON_MAX}
						placeholder="Why is this PR being cancelled?"
						disabled={mutation.isPending}
						onChange={(event) => setReason(event.target.value)}
					/>
					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={mutation.isPending}
						onClick={() => handleOpenChange(false)}
					>
						Keep PR
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={mutation.isPending || !valid}
						onClick={onConfirm}
					>
						{mutation.isPending ? "Cancelling..." : "Cancel PR"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
