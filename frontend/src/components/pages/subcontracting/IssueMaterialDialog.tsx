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
import { useIssueChallanMutation } from "@/lib/api/subcontracting/queries";
import type { ScoLine } from "@/types/subcontracting";

type LineDraft = { qty: string; heat: string };

function todayIso() {
	// Local calendar date (not UTC) so "today" is right early morning in IST.
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function remaining(line: ScoLine) {
	return Math.max(line.rawQtyToIssue - line.issuedQty, 0);
}

export function IssueMaterialDialog({
	scoId,
	scoNumber,
	items,
}: {
	scoId: number;
	scoNumber: string;
	items: ScoLine[];
}) {
	const [open, setOpen] = useState(false);
	const [challanDate, setChallanDate] = useState(todayIso);
	const [ewayBillNo, setEwayBillNo] = useState("");
	const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
	const [error, setError] = useState<string | null>(null);
	const mutation = useIssueChallanMutation(scoId);

	const draftFor = (line: ScoLine): LineDraft =>
		drafts[line.id] ?? { qty: "", heat: line.rawItemBatch ?? "" };

	const patchDraft = (line: ScoLine, patch: Partial<LineDraft>) =>
		setDrafts((current) => ({
			...current,
			[line.id]: { ...draftFor(line), ...patch },
		}));

	const reset = () => {
		setChallanDate(todayIso());
		setEwayBillNo("");
		setDrafts({});
		setError(null);
	};

	const submit = () => {
		const lines: Array<{
			scoItemId: number;
			qty: number;
			heatNumber?: string;
		}> = [];
		for (const line of items) {
			const draft = draftFor(line);
			if (draft.qty.trim() === "") continue;
			const qty = Number(draft.qty);
			if (!Number.isInteger(qty) || qty < 1) {
				setError(
					`${line.rawItemSku}: quantity must be a whole number, 1 or more`,
				);
				return;
			}
			if (qty > remaining(line)) {
				setError(
					`${line.rawItemSku}: only ${remaining(line)} left to send on this line`,
				);
				return;
			}
			const heat = draft.heat.trim();
			lines.push({
				scoItemId: line.id,
				qty,
				...(heat ? { heatNumber: heat } : {}),
			});
		}
		if (lines.length === 0) {
			setError("Enter a quantity for at least one line");
			return;
		}
		setError(null);
		const eway = ewayBillNo.trim();
		mutation.mutate(
			{
				challanDate: challanDate
					? new Date(`${challanDate}T00:00:00`).toISOString()
					: undefined,
				...(eway ? { ewayBillNo: eway } : {}),
				lines,
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						setOpen(false);
						reset();
					}
				},
				// The backend message (400/409) is shown inline as well as toasted.
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
					Issue material
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Issue material for {scoNumber}</DialogTitle>
					<DialogDescription>
						Creates a job-work challan and moves stock from the store to the
						vendor. Leave a line empty to skip it.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="challan-date">Challan date</Label>
						<Input
							id="challan-date"
							type="date"
							max={todayIso()}
							value={challanDate}
							onChange={(event) => setChallanDate(event.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="challan-eway">E-way bill no.</Label>
						<Input
							id="challan-eway"
							value={ewayBillNo}
							maxLength={50}
							onChange={(event) => setEwayBillNo(event.target.value)}
							placeholder="Required for inter-state, unregistered vendor, or Rs 50,000+"
						/>
					</div>
				</div>

				<div className="space-y-3">
					{items.map((line) => {
						const left = remaining(line);
						const draft = draftFor(line);
						return (
							<div
								key={line.id}
								className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_7rem_9rem]"
							>
								<div className="text-xs">
									<p className="font-medium">
										{line.rawItemSku} · {line.rawItemName}
									</p>
									<p className="text-muted-foreground">
										Send {line.rawQtyToIssue} · issued {line.issuedQty} · left{" "}
										{left}
									</p>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`challan-qty-${line.id}`}>
										Qty (max {left})
									</Label>
									<Input
										id={`challan-qty-${line.id}`}
										type="number"
										inputMode="numeric"
										min={1}
										max={left}
										step={1}
										disabled={left === 0}
										value={draft.qty}
										onChange={(event) =>
											patchDraft(line, { qty: event.target.value })
										}
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`challan-heat-${line.id}`}>Heat number</Label>
									<Input
										id={`challan-heat-${line.id}`}
										disabled={left === 0}
										value={draft.heat}
										onChange={(event) =>
											patchDraft(line, { heat: event.target.value })
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
						{mutation.isPending ? "Issuing..." : "Create challan"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
