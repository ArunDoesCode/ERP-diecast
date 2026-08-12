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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdatePoDelayMutation } from "@/lib/api/purchase-orders/queries";

// Narrowed shape so this dialog works from both the full `PurchaseOrder` (tracking
// cards) and `PRLinkedPo`, which doesn't carry delivery-date fields — those are
// optional here and simply prefill blank in that case.
type DelayPoDialogTarget = {
	id: number;
	poNumber: string;
	revisedDeliveryDate?: string | null;
	expectedDeliveryDate?: string | null;
	delayReason?: string | null;
};

export function DelayPoDialog({
	po,
	prId,
	open,
	onOpenChange,
	onUpdated,
}: {
	po: DelayPoDialogTarget;
	prId?: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUpdated: () => void;
}) {
	const [revisedDeliveryDate, setRevisedDeliveryDate] = useState(
		po.revisedDeliveryDate ?? po.expectedDeliveryDate ?? "",
	);
	const [delayReason, setDelayReason] = useState(po.delayReason ?? "");
	const mutation = useUpdatePoDelayMutation();

	function reset() {
		setRevisedDeliveryDate(
			po.revisedDeliveryDate ?? po.expectedDeliveryDate ?? "",
		);
		setDelayReason(po.delayReason ?? "");
	}

	function onSubmit() {
		mutation.mutate(
			{
				poId: po.id,
				prId,
				payload: {
					revisedDeliveryDate: revisedDeliveryDate || undefined,
					delayReason: delayReason.trim() || undefined,
				},
			},
			{
				onSuccess: (result) => {
					if (result.success) onUpdated();
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) reset();
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>Update delivery delay · {po.poNumber}</DialogTitle>
					<DialogDescription>
						Records a supplier-revised delivery date without changing the
						original expected delivery date.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 px-6 py-5">
					<div>
						<label className="mb-1 block text-xs font-medium">
							Revised delivery date
						</label>
						<Input
							type="date"
							value={revisedDeliveryDate}
							onChange={(event) => setRevisedDeliveryDate(event.target.value)}
						/>
					</div>

					<div>
						<label className="mb-1 block text-xs font-medium">
							Delay reason
						</label>
						<Textarea
							value={delayReason}
							onChange={(event) => setDelayReason(event.target.value)}
							placeholder="Why is delivery delayed?"
						/>
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
							mutation.isPending ||
							(!revisedDeliveryDate.trim() && !delayReason.trim())
						}
						onClick={onSubmit}
					>
						Save delay
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
