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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDecideQaMutation } from "@/lib/api/subcontracting/queries";
import type { ReceiptLine } from "@/types/subcontracting";

export function QaDecisionDialog({
	scoId,
	receiptId,
	line,
}: {
	scoId: number;
	receiptId: number;
	line: ReceiptLine;
}) {
	const [open, setOpen] = useState(false);
	const [accepted, setAccepted] = useState("");
	const [rejected, setRejected] = useState("");
	const [notes, setNotes] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useDecideQaMutation(scoId, receiptId);

	const reset = () => {
		setAccepted("");
		setRejected("");
		setNotes("");
		setError(null);
	};

	const submit = () => {
		const acceptedQty = accepted.trim() === "" ? 0 : Number(accepted);
		const rejectedQty = rejected.trim() === "" ? 0 : Number(rejected);
		if (
			!Number.isInteger(acceptedQty) ||
			!Number.isInteger(rejectedQty) ||
			acceptedQty < 0 ||
			rejectedQty < 0
		) {
			setError("Quantities must be whole numbers, 0 or more");
			return;
		}
		if (acceptedQty + rejectedQty !== line.processedQty) {
			setError(
				`Accepted + rejected must equal processed (${line.processedQty})`,
			);
			return;
		}
		setError(null);
		const note = notes.trim();
		mutation.mutate(
			{
				lineId: line.id,
				acceptedQty,
				rejectedQty,
				...(note ? { notes: note } : {}),
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						setOpen(false);
						reset();
					}
				},
				onError: (err) => setError(err.message),
			},
		);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm" variant="outline">
					QA decision
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>QA decision</DialogTitle>
					<DialogDescription>
						{line.finishedItemSku} · {line.finishedItemName}:{" "}
						{line.processedQty} processed pieces. Accepted plus rejected must
						equal processed.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor={`qa-accepted-${line.id}`}>Accepted qty</Label>
						<Input
							id={`qa-accepted-${line.id}`}
							type="number"
							inputMode="numeric"
							min={0}
							max={line.processedQty}
							step={1}
							value={accepted}
							onChange={(event) => setAccepted(event.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`qa-rejected-${line.id}`}>Rejected qty</Label>
						<Input
							id={`qa-rejected-${line.id}`}
							type="number"
							inputMode="numeric"
							min={0}
							max={line.processedQty}
							step={1}
							value={rejected}
							onChange={(event) => setRejected(event.target.value)}
						/>
					</div>
					<div className="space-y-1 sm:col-span-2">
						<Label htmlFor={`qa-notes-${line.id}`}>Notes</Label>
						<Input
							id={`qa-notes-${line.id}`}
							maxLength={500}
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
						/>
					</div>
				</div>
				{error ? (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
					>
						Back
					</Button>
					<Button type="button" disabled={mutation.isPending} onClick={submit}>
						{mutation.isPending ? "Saving..." : "Save decision"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
