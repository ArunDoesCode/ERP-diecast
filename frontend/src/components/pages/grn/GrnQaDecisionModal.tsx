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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { useGrnQaDecisionMutation } from "@/lib/api/grn/queries";
import type { GrnItemDetail } from "@/types/grn";

const OVER_RECEIPT_MULTIPLIER = 1.05;

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
	const [decision, setDecision] = useState<"accept" | "reject">("accept");
	const [acceptedQty, setAcceptedQty] = useState(String(line.receivedQty));
	const [rejectedQty, setRejectedQty] = useState("0");
	const [remarks, setRemarks] = useState("");
	const [certificateUrl, setCertificateUrl] = useState("");
	const mutation = useGrnQaDecisionMutation();

	const isOverReceipt =
		decision === "accept" &&
		Number(acceptedQty || 0) > line.orderedQty * OVER_RECEIPT_MULTIPLIER;
	const isExempt = useCan("grn.over_receipt_override");

	function reset() {
		setDecision("accept");
		setAcceptedQty(String(line.receivedQty));
		setRejectedQty("0");
		setRemarks("");
		setCertificateUrl("");
	}

	function onSubmit() {
		mutation.mutate(
			{
				grnId,
				lineId: line.id,
				poId,
				payload: {
					decision,
					acceptedQty:
						decision === "accept" ? Number(acceptedQty || 0) : undefined,
					rejectedQty:
						decision === "reject" ? Number(rejectedQty || 0) : undefined,
					remarks: remarks.trim() || undefined,
					certificateUrl: certificateUrl.trim() || undefined,
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
					<div>
						<label
							htmlFor="grn-qa-decision"
							className="mb-1 block text-xs font-medium"
						>
							Decision
						</label>
						<Select
							value={decision}
							onValueChange={(value) =>
								setDecision(value as "accept" | "reject")
							}
						>
							<SelectTrigger id="grn-qa-decision" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="accept">Accept</SelectItem>
								<SelectItem value="reject">Reject</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{decision === "accept" ? (
						<div>
							<label
								htmlFor="grn-qa-accepted-qty"
								className="mb-1 block text-xs font-medium"
							>
								Accepted qty
							</label>
							<Input
								id="grn-qa-accepted-qty"
								type="number"
								min={0}
								value={acceptedQty}
								onChange={(event) => setAcceptedQty(event.target.value)}
							/>
						</div>
					) : (
						<div>
							<label
								htmlFor="grn-qa-rejected-qty"
								className="mb-1 block text-xs font-medium"
							>
								Rejected qty
							</label>
							<Input
								id="grn-qa-rejected-qty"
								type="number"
								min={0}
								value={rejectedQty}
								onChange={(event) => setRejectedQty(event.target.value)}
							/>
						</div>
					)}

					{isOverReceipt ? (
						<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							{isExempt
								? "This exceeds 105% of the ordered qty. Your role can still submit — the backend will not block this."
								: "This exceeds 105% of the ordered qty. Only owner/back office roles can push this through if the server blocks it."}
						</p>
					) : null}

					<div>
						<label
							htmlFor="grn-qa-certificate-url"
							className="mb-1 block text-xs font-medium"
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
							className="mb-1 block text-xs font-medium"
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
						disabled={mutation.isPending}
						onClick={onSubmit}
					>
						Submit decision
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
