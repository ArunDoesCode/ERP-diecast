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
import { useCancelScoMutation } from "@/lib/api/subcontracting/queries";
import { SCO_REASON_MAX, SCO_REASON_MIN } from "@/types/subcontracting";

export function CancelScoAlert({
	scoId,
	scoNumber,
}: {
	scoId: number;
	scoNumber: string;
}) {
	const [reason, setReason] = useState("");
	const mutation = useCancelScoMutation();
	const trimmed = reason.trim();

	return (
		<AlertDialog
			onOpenChange={(open) => {
				if (!open) setReason("");
			}}
		>
			<AlertDialogTrigger asChild>
				<Button type="button" size="sm" variant="outline">
					Cancel order
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Cancel {scoNumber}?</AlertDialogTitle>
					<AlertDialogDescription>
						This cannot be undone. A reason is required.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Label htmlFor={`sco-cancel-reason-${scoId}`}>Reason</Label>
				<Textarea
					id={`sco-cancel-reason-${scoId}`}
					value={reason}
					maxLength={SCO_REASON_MAX}
					onChange={(event) => setReason(event.target.value)}
					placeholder={`Reason for cancellation (at least ${SCO_REASON_MIN} characters)`}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={trimmed.length < SCO_REASON_MIN || mutation.isPending}
						onClick={() => mutation.mutate({ scoId, reason: trimmed })}
					>
						Cancel SCO
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
