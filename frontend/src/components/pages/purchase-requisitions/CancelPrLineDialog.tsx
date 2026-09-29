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
import { useCancelPurchaseRequisitionLineMutation } from "@/lib/api/purchase-requisitions/queries";
import {
	PR_CANCEL_REASON_MAX,
	PR_CANCEL_REASON_MIN,
} from "@/types/purchase-requisitions";

/** BR-PR-33: cancel one pending PR line with a reason. */
export function CancelPrLineDialog({
	prId,
	lineId,
	itemName,
	open,
	onOpenChange,
}: {
	prId: number;
	lineId: number;
	itemName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useCancelPurchaseRequisitionLineMutation();
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
		setError(null);
		mutation.mutate(
			{ prId, lineId, reason: trimmed },
			{
				onSuccess: (result) => {
					if (!result.success) {
						setError(result.message || "Could not cancel the line.");
						return;
					}
					handleOpenChange(false);
				},
				onError: (err) =>
					setError(
						err instanceof ApiClientError
							? err.message
							: "Could not cancel the line. Try again.",
					),
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Cancel line · {itemName}</DialogTitle>
					<DialogDescription>
						Only this line is cancelled. It cannot be undone. The other lines
						stay as they are.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor={`pr-line-cancel-reason-${lineId}`}>Reason</Label>
					<Textarea
						id={`pr-line-cancel-reason-${lineId}`}
						value={reason}
						maxLength={PR_CANCEL_REASON_MAX}
						placeholder={`Reason (${PR_CANCEL_REASON_MIN}-${PR_CANCEL_REASON_MAX} characters)`}
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
						Keep line
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={mutation.isPending || !valid}
						onClick={onConfirm}
					>
						{mutation.isPending ? "Cancelling..." : "Cancel line"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
