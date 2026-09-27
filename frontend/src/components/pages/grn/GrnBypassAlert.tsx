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
import { useGrnBypassMutation } from "@/lib/api/grn/queries";
import { isExemptFromOverReceiptGuard } from "@/lib/grn-permissions";
import type { GrnItemDetail } from "@/types/grn";

const OVER_RECEIPT_MULTIPLIER = 1.05;

export function GrnBypassAlert({
	grnId,
	poId,
	line,
	role,
	open,
	onOpenChange,
}: {
	grnId: number;
	poId: number;
	line: GrnItemDetail;
	role?: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [bypassReason, setBypassReason] = useState("");
	const [acceptedQty, setAcceptedQty] = useState(String(line.receivedQty));
	const mutation = useGrnBypassMutation();

	const isOverReceipt =
		Number(acceptedQty || 0) > line.orderedQty * OVER_RECEIPT_MULTIPLIER;
	const isExempt = isExemptFromOverReceiptGuard(role);

	function reset() {
		setBypassReason("");
		setAcceptedQty(String(line.receivedQty));
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Bypass QA · {line.itemName}</AlertDialogTitle>
					<AlertDialogDescription>
						Posts straight to inventory without a QA pass. A reason is required.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3">
					<div>
						<label
							htmlFor="grn-bypass-accepted-qty"
							className="mb-1 block text-xs font-medium"
						>
							Accepted qty
						</label>
						<Input
							id="grn-bypass-accepted-qty"
							type="number"
							min={0}
							value={acceptedQty}
							onChange={(event) => setAcceptedQty(event.target.value)}
						/>
					</div>

					{isOverReceipt ? (
						<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							{isExempt
								? "This exceeds 105% of the ordered qty. Your role can still submit — the backend will not block this."
								: "This exceeds 105% of the ordered qty. Only owner/back office roles can push this through if the server blocks it."}
						</p>
					) : null}

					<Textarea
						value={bypassReason}
						onChange={(event) => setBypassReason(event.target.value)}
						placeholder="Reason for bypassing QA"
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={!bypassReason.trim() || mutation.isPending}
						onClick={() =>
							mutation.mutate({
								grnId,
								lineId: line.id,
								poId,
								payload: {
									bypassReason: bypassReason.trim(),
									acceptedQty: Number(acceptedQty || 0),
								},
							})
						}
					>
						Bypass QA
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
