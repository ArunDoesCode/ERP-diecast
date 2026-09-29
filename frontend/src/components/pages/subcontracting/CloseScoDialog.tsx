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
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { useCloseScoMutation } from "@/lib/api/subcontracting/queries";
import {
	SCO_REASON_MAX,
	SCO_REASON_MIN,
	type ScoLine,
} from "@/types/subcontracting";

export function CloseScoDialog({
	scoId,
	scoNumber,
	items,
}: {
	scoId: number;
	scoNumber: string;
	items: ScoLine[];
}) {
	const canOverride = useCan("sco.loss_override");
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const mutation = useCloseScoMutation();
	const trimmed = reason.trim();

	const qtyLeft = items.reduce((sum, line) => sum + (line.qtyAtVendor ?? 0), 0);
	const hasLoss = qtyLeft > 0;
	const reasonValid =
		trimmed.length >= SCO_REASON_MIN && trimmed.length <= SCO_REASON_MAX;
	const blockedByRole = hasLoss && !canOverride;
	const canSubmit =
		!blockedByRole && (!hasLoss || reasonValid) && !mutation.isPending;

	function onConfirm() {
		mutation.mutate(
			{ scoId, reason: trimmed || undefined },
			{
				onSuccess: (result) => {
					if (result.success) setOpen(false);
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setReason("");
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm" variant="outline">
					Close order
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Close {scoNumber}?</DialogTitle>
					<DialogDescription>
						Closing is final. Any material not yet issued is dropped.
					</DialogDescription>
				</DialogHeader>

				<p className="text-sm">
					Qty left at vendor: <span className="font-medium">{qtyLeft}</span>
				</p>

				{hasLoss ? (
					blockedByRole ? (
						<p className="text-xs text-muted-foreground">
							Material is still at the vendor. Closing writes it off as a loss,
							so the owner (loss approval right) must close this order.
						</p>
					) : (
						<div className="space-y-1">
							<p className="text-xs text-muted-foreground">
								This qty will be written off as a loss at issue cost. A reason
								is required.
							</p>
							<Label htmlFor={`sco-close-reason-${scoId}`}>Reason</Label>
							<Textarea
								id={`sco-close-reason-${scoId}`}
								value={reason}
								maxLength={SCO_REASON_MAX}
								onChange={(event) => setReason(event.target.value)}
								placeholder={`Reason for the loss (at least ${SCO_REASON_MIN} characters)`}
							/>
						</div>
					)
				) : (
					<p className="text-xs text-muted-foreground">
						Nothing is left at the vendor, so no loss will be posted.
					</p>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
					>
						Back
					</Button>
					<Button type="button" disabled={!canSubmit} onClick={onConfirm}>
						{mutation.isPending ? "Closing..." : "Close SCO"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
