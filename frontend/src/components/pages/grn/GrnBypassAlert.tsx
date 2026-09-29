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
import { canOverrideOverReceipt } from "@/lib/grn-permissions";
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
	const [batchNumber, setBatchNumber] = useState(line.batchNumber ?? "");
	const [overrideReason, setOverrideReason] = useState("");
	const mutation = useGrnBypassMutation();

	const accepted = Number(acceptedQty || 0);
	const rejectedRest = Math.max(
		0,
		Math.round((line.receivedQty - accepted) * 1000) / 1000,
	);
	const isOverReceipt = accepted > line.orderedQty * OVER_RECEIPT_MULTIPLIER;
	const canOverride = canOverrideOverReceipt(role);

	function reset() {
		setBypassReason("");
		setAcceptedQty(String(line.receivedQty));
		setBatchNumber(line.batchNumber ?? "");
		setOverrideReason("");
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
							step="any"
							value={acceptedQty}
							onChange={(event) => setAcceptedQty(event.target.value)}
						/>
						{rejectedRest > 0 ? (
							<p className="mt-1 text-xs text-muted-foreground">
								Rest ({rejectedRest}) will be recorded as rejected.
							</p>
						) : null}
					</div>

					<div>
						<label
							htmlFor="grn-bypass-batch-number"
							className="mb-1 block text-xs font-medium"
						>
							Batch / heat no
						</label>
						<Input
							id="grn-bypass-batch-number"
							value={batchNumber}
							onChange={(event) => setBatchNumber(event.target.value)}
							placeholder="Optional"
						/>
					</div>

					{isOverReceipt ? (
						canOverride ? (
							<div>
								<p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
									This exceeds 105% of the ordered qty. Give a reason to
									override.
								</p>
								<label
									htmlFor="grn-bypass-override-reason"
									className="mb-1 block text-xs font-medium"
								>
									Over-receipt override reason
								</label>
								<Textarea
									id="grn-bypass-override-reason"
									value={overrideReason}
									onChange={(event) => setOverrideReason(event.target.value)}
								/>
							</div>
						) : (
							<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
								This exceeds 105% of the ordered qty. Your role cannot override
								it; ask the owner or back office.
							</p>
						)
					) : null}

					<label
						htmlFor="grn-bypass-reason"
						className="block text-xs font-medium"
					>
						Bypass reason
					</label>
					<Textarea
						id="grn-bypass-reason"
						value={bypassReason}
						onChange={(event) => setBypassReason(event.target.value)}
						placeholder="Reason for bypassing QA"
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={
							!bypassReason.trim() ||
							!(accepted > 0) ||
							accepted > line.receivedQty ||
							(isOverReceipt && canOverride && !overrideReason.trim()) ||
							mutation.isPending
						}
						onClick={() =>
							mutation.mutate({
								grnId,
								lineId: line.id,
								poId,
								payload: {
									bypassReason: bypassReason.trim(),
									acceptedQty: accepted,
									batchNumber: batchNumber.trim() || undefined,
									overrideReason:
										isOverReceipt && canOverride
											? overrideReason.trim() || undefined
											: undefined,
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
