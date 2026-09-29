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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGrnCorrectionMutation, usePoItemUoms } from "@/lib/api/grn/queries";
import { qtyStep } from "@/lib/grn-units";
import type { GrnItemDetail } from "@/types/grn";

export function GrnCorrectionAlert({
	grnId,
	poId,
	line,
	open,
	onOpenChange,
}: {
	grnId: number;
	poId: number;
	line: GrnItemDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [qty, setQty] = useState("");
	const [reason, setReason] = useState("");
	const mutation = useGrnCorrectionMutation();
	const uoms = usePoItemUoms(poId, open);
	const uom = line.poItemId != null ? uoms.get(line.poItemId) : undefined;
	const qtyNum = Number(qty);
	const outOfRange = !(qtyNum > 0) || qtyNum > line.netAcceptedQty;

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					setQty("");
					setReason("");
				}
				onOpenChange(next);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Correct · {line.itemName}</AlertDialogTitle>
					<AlertDialogDescription>
						Posts a negative stock adjustment against this line's original
						posting. The original GRN line is not changed. Max{" "}
						{line.netAcceptedQty} can still be corrected. A reason is required.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3">
					<div>
						<label
							htmlFor="grn-correction-qty"
							className="mb-1 block text-xs font-medium"
						>
							Correction qty
						</label>
						<Input
							id="grn-correction-qty"
							type="number"
							min={0}
							max={line.netAcceptedQty}
							step={qtyStep(uom)}
							value={qty}
							onChange={(event) => setQty(event.target.value)}
						/>
					</div>
					<label
						htmlFor="grn-correction-reason"
						className="block text-xs font-medium"
					>
						Reason
					</label>
					<Textarea
						id="grn-correction-reason"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						placeholder="Reason for correction"
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={!reason.trim() || outOfRange || mutation.isPending}
						onClick={() =>
							mutation.mutate({
								grnId,
								poId,
								lineId: line.id,
								payload: { qty: Number(qty), reason: reason.trim() },
							})
						}
					>
						Submit correction
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
