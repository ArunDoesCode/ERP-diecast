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
import { useCreateReceiptMutation } from "@/lib/api/subcontracting/queries";
import type { ScoLine } from "@/types/subcontracting";

type LineDraft = { processed: string; unprocessed: string };

function todayIso() {
	return new Date().toISOString().slice(0, 10);
}

function atVendor(line: ScoLine) {
	return line.qtyAtVendor ?? 0;
}

// Raw pcs used per finished pc (send / return), BR-SCO-12.
function ratio(line: ScoLine) {
	return line.expectedReturnQty > 0
		? line.rawQtyToIssue / line.expectedReturnQty
		: 1;
}

function parseQty(value: string) {
	return value.trim() === "" ? 0 : Number(value);
}

export function EnterReceiptDialog({
	scoId,
	scoNumber,
	items,
}: {
	scoId: number;
	scoNumber: string;
	items: ScoLine[];
}) {
	const [open, setOpen] = useState(false);
	const [challanNo, setChallanNo] = useState("");
	const [receivedDate, setReceivedDate] = useState(todayIso);
	const [notes, setNotes] = useState("");
	const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
	const [error, setError] = useState<string | null>(null);
	const mutation = useCreateReceiptMutation(scoId);

	const draftFor = (line: ScoLine): LineDraft =>
		drafts[line.id] ?? { processed: "", unprocessed: "" };

	const patchDraft = (line: ScoLine, patch: Partial<LineDraft>) =>
		setDrafts((current) => ({
			...current,
			[line.id]: { ...draftFor(line), ...patch },
		}));

	const reset = () => {
		setChallanNo("");
		setReceivedDate(todayIso());
		setNotes("");
		setDrafts({});
		setError(null);
	};

	const submit = () => {
		if (challanNo.trim() === "") {
			setError("Enter the vendor challan / invoice number");
			return;
		}
		const lines: Array<{
			scoItemId: number;
			processedQty: number;
			unprocessedQty?: number;
		}> = [];
		for (const line of items) {
			const draft = draftFor(line);
			if (draft.processed.trim() === "" && draft.unprocessed.trim() === "")
				continue;
			const processed = parseQty(draft.processed);
			const unprocessed = parseQty(draft.unprocessed);
			if (
				!Number.isInteger(processed) ||
				!Number.isInteger(unprocessed) ||
				processed < 0 ||
				unprocessed < 0
			) {
				setError(`${line.rawItemSku}: quantities must be whole numbers`);
				return;
			}
			if (processed + unprocessed < 1) continue;
			if (processed * ratio(line) + unprocessed > atVendor(line)) {
				setError(
					`${line.rawItemSku}: only ${atVendor(line)} still at the vendor`,
				);
				return;
			}
			lines.push({
				scoItemId: line.id,
				processedQty: processed,
				...(unprocessed > 0 ? { unprocessedQty: unprocessed } : {}),
			});
		}
		if (lines.length === 0) {
			setError("Enter a quantity for at least one line");
			return;
		}
		setError(null);
		const note = notes.trim();
		mutation.mutate(
			{
				vendorChallanNo: challanNo.trim(),
				receivedDate: receivedDate
					? new Date(`${receivedDate}T00:00:00`).toISOString()
					: undefined,
				...(note ? { notes: note } : {}),
				lines,
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						setOpen(false);
						reset();
					}
				},
				// 400/409 messages are shown inline as well as toasted.
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
				<Button type="button" size="sm">
					Enter receipt
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Enter receipt for {scoNumber}</DialogTitle>
					<DialogDescription>
						Record what came back from the vendor. Processed pieces wait for QA;
						unprocessed raw material goes back to the store now.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="receipt-challan-no">
							Vendor challan / invoice no.
						</Label>
						<Input
							id="receipt-challan-no"
							value={challanNo}
							maxLength={50}
							onChange={(event) => setChallanNo(event.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="receipt-date">Received date</Label>
						<Input
							id="receipt-date"
							type="date"
							value={receivedDate}
							onChange={(event) => setReceivedDate(event.target.value)}
						/>
					</div>
					<div className="space-y-1 sm:col-span-2">
						<Label htmlFor="receipt-notes">Notes</Label>
						<Input
							id="receipt-notes"
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
						/>
					</div>
				</div>

				<div className="space-y-3">
					{items.map((line) => {
						const left = atVendor(line);
						const draft = draftFor(line);
						return (
							<div
								key={line.id}
								className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_8rem_8rem]"
							>
								<div className="text-xs">
									<p className="font-medium">
										{line.finishedItemSku} · {line.finishedItemName}
									</p>
									<p className="text-muted-foreground">
										Raw {line.rawItemSku} · at vendor {left}
									</p>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`receipt-processed-${line.id}`}>
										Processed qty
									</Label>
									<Input
										id={`receipt-processed-${line.id}`}
										type="number"
										inputMode="numeric"
										min={0}
										step={1}
										disabled={left === 0}
										value={draft.processed}
										onChange={(event) =>
											patchDraft(line, { processed: event.target.value })
										}
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`receipt-unprocessed-${line.id}`}>
										Unprocessed (max {left})
									</Label>
									<Input
										id={`receipt-unprocessed-${line.id}`}
										type="number"
										inputMode="numeric"
										min={0}
										max={left}
										step={1}
										disabled={left === 0}
										value={draft.unprocessed}
										onChange={(event) =>
											patchDraft(line, { unprocessed: event.target.value })
										}
									/>
								</div>
							</div>
						);
					})}
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
						{mutation.isPending ? "Saving..." : "Save receipt"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
