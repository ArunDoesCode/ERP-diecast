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
import { useGrnCorrectionMutation } from "@/lib/api/grn/queries";
import type { GrnItemDetail } from "@/types/grn";

export function GrnCorrectionAlert({
	grnId,
	line,
	open,
	onOpenChange,
}: {
	grnId: number;
	line: GrnItemDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [qty, setQty] = useState("");
	const [reason, setReason] = useState("");
	const mutation = useGrnCorrectionMutation();

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
						posting. The original GRN line is not changed. A reason is
						required.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3">
					<div>
						<label className="mb-1 block text-xs font-medium">
							Correction qty
						</label>
						<Input
							type="number"
							min={0}
							step="any"
							value={qty}
							onChange={(event) => setQty(event.target.value)}
						/>
					</div>
					<Textarea
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						placeholder="Reason for correction"
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={
							!reason.trim() || !(Number(qty) > 0) || mutation.isPending
						}
						onClick={() =>
							mutation.mutate({
								grnId,
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
