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
import { useCan } from "@/hooks/use-can";
import { useGrnQaDecisionMutation } from "@/lib/api/grn/queries";
import { exceedsOverReceiptTolerance, qtyStep } from "@/lib/grn-units";
import type { GrnItemDetail } from "@/types/grn";

export function GrnQaDecisionModal({
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
	const [acceptedQty, setAcceptedQty] = useState(String(line.receivedQty));
	const [rejectedQty, setRejectedQty] = useState("0");
	const [batchNumber, setBatchNumber] = useState(line.batchNumber ?? "");
	const [remarks, setRemarks] = useState("");
	const [certificateUrl, setCertificateUrl] = useState("");
	const [overrideReason, setOverrideReason] = useState("");
	const uom = line.uom;
	const mutation = useGrnQaDecisionMutation();

	const accepted = Number(acceptedQty || 0);
	const rejected = Number(rejectedQty || 0);
	// Compare in thousandths so 3-decimal quantities add up exactly.
	const sumMatches =
		Math.round((accepted + rejected) * 1000) ===
		Math.round(line.receivedQty * 1000);
	const isOverReceipt = exceedsOverReceiptTolerance(
		line.orderedQty,
		line.poReceivedQty,
		accepted,
	);
	const canOverride = useCan("grn.over_receipt_override");

	function reset() {
		setAcceptedQty(String(line.receivedQty));
		setRejectedQty("0");
		setBatchNumber(line.batchNumber ?? "");
		setRemarks("");
		setCertificateUrl("");
		setOverrideReason("");
	}

	function onSubmit() {
		mutation.mutate(
			{
				grnId,
				lineId: line.id,
				poId,
				payload: {
					acceptedQty: accepted,
					rejectedQty: rejected,
					batchNumber: batchNumber.trim() || undefined,
					remarks: remarks.trim() || undefined,
					certificateUrl: certificateUrl.trim() || undefined,
					overrideReason:
						isOverReceipt && canOverride
							? overrideReason.trim() || undefined
							: undefined,
				},
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						reset();
						onOpenChange(false);
					}
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent className="gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>QA decision · {line.itemName}</DialogTitle>
					<DialogDescription>
						Received {line.receivedQty} of {line.orderedQty} ordered.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 px-6 py-5">
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="grn-qa-accepted-qty"
								className="mb-1 block text-[13px] leading-[18px] font-semibold"
							>
								Accepted qty
							</label>
							<Input
								id="grn-qa-accepted-qty"
								type="number"
								min={0}
								step={qtyStep(uom)}
								value={acceptedQty}
								onChange={(event) => setAcceptedQty(event.target.value)}
							/>
						</div>
						<div>
							<label
								htmlFor="grn-qa-rejected-qty"
								className="mb-1 block text-[13px] leading-[18px] font-semibold"
							>
								Rejected qty
							</label>
							<Input
								id="grn-qa-rejected-qty"
								type="number"
								min={0}
								step={qtyStep(uom)}
								value={rejectedQty}
								onChange={(event) => setRejectedQty(event.target.value)}
							/>
						</div>
					</div>
					{!sumMatches ? (
						<p className="text-sm text-destructive">
							Accepted + rejected must equal the arrived qty ({line.receivedQty}
							).
						</p>
					) : null}

					<div>
						<label
							htmlFor="grn-qa-batch-number"
							className="mb-1 block text-[13px] leading-[18px] font-semibold"
						>
							Batch / heat no
						</label>
						<Input
							id="grn-qa-batch-number"
							value={batchNumber}
							onChange={(event) => setBatchNumber(event.target.value)}
							placeholder="Optional"
						/>
					</div>

					{isOverReceipt ? (
						canOverride ? (
							<div>
								<p className="mb-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
									With earlier receipts this exceeds 105% of the ordered qty.
									Give a reason to override.
								</p>
								<label
									htmlFor="grn-qa-override-reason"
									className="mb-1 block text-[13px] leading-[18px] font-semibold"
								>
									Over-receipt override reason
								</label>
								<Textarea
									id="grn-qa-override-reason"
									value={overrideReason}
									onChange={(event) => setOverrideReason(event.target.value)}
								/>
							</div>
						) : (
							<p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
								With earlier receipts this exceeds 105% of the ordered qty. You
								cannot override it; ask the owner or back office.
							</p>
						)
					) : null}

					<div>
						<label
							htmlFor="grn-qa-certificate-url"
							className="mb-1 block text-[13px] leading-[18px] font-semibold"
						>
							Certificate URL
						</label>
						<Input
							id="grn-qa-certificate-url"
							value={certificateUrl}
							onChange={(event) => setCertificateUrl(event.target.value)}
							placeholder="Optional QA certificate link"
						/>
					</div>

					<div>
						<label
							htmlFor="grn-qa-remarks"
							className="mb-1 block text-[13px] leading-[18px] font-semibold"
						>
							Remarks
						</label>
						<Textarea
							id="grn-qa-remarks"
							value={remarks}
							onChange={(event) => setRemarks(event.target.value)}
							placeholder="Optional"
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
							!sumMatches ||
							accepted + rejected <= 0 ||
							(isOverReceipt && canOverride && !overrideReason.trim())
						}
						onClick={onSubmit}
					>
						Submit decision
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
