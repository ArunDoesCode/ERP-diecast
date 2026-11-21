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
import { useCancelPurchaseOrderMutation } from "@/lib/api/purchase-orders/queries";
import { PO_REASON_MAX, PO_REASON_MIN } from "@/types/purchase-orders";

export function CancelPoAlert({
	poId,
	poNumber,
	open,
	onOpenChange,
	onCancelled,
}: {
	poId: number;
	poNumber: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCancelled?: () => void;
}) {
	const [reason, setReason] = useState("");
	const mutation = useCancelPurchaseOrderMutation();
	const trimmed = reason.trim();

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setReason("");
			}}
		>
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
						onClick={() =>
							mutation.mutate(
								{ poId, reason: trimmed },
								{ onSuccess: () => onCancelled?.() },
							)
						}
					>
						Cancel PO
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
