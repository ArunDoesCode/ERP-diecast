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
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useShortClosePoMutation } from "@/lib/api/purchase-orders/queries";
import { PO_REASON_MAX, PO_REASON_MIN } from "@/types/purchase-orders";

/** BR-PO-13: close a partly received PO as a whole, with a reason. */
export function ShortClosePoAlert({
	poId,
	poNumber,
}: {
	poId: number;
	poNumber: string;
}) {
	const [reason, setReason] = useState("");
	const mutation = useShortClosePoMutation();
	const trimmed = reason.trim();

	return (
		<AlertDialog
			onOpenChange={(open) => {
				if (!open) setReason("");
			}}
		>
			<AlertDialogTrigger asChild>
				<Button type="button" size="sm" variant="outline">
					Short-close
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Short-close {poNumber}?</AlertDialogTitle>
					<AlertDialogDescription>
						The supplier will not send the rest. The open quantity is dropped,
						the PR lines are closed and no more goods can be received.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-1">
					<Label htmlFor={`po-short-close-reason-${poId}`}>Reason</Label>
					<Textarea
						id={`po-short-close-reason-${poId}`}
						value={reason}
						maxLength={PO_REASON_MAX}
						onChange={(event) => setReason(event.target.value)}
						placeholder="Why is the rest not coming?"
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={trimmed.length < PO_REASON_MIN || mutation.isPending}
						onClick={() =>
							mutation.mutate({ poId, payload: { reason: trimmed } })
						}
					>
						Short-close PO
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
