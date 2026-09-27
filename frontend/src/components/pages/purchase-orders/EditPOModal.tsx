"use client";

import { IconCurrencyRupee } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	usePurchaseOrderDetailQuery,
	useUpdatePurchaseOrderMutation,
} from "@/lib/api/purchase-orders/queries";
import type { PurchaseRequisitionItem } from "@/types/purchase-requisitions";

function formatMoney(paise?: number | null) {
	return `₹${((paise ?? 0) / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 0,
	})}`;
}

export function EditPOModal({
	poId,
	prId,
	pendingLines,
	open,
	onOpenChange,
	onSaved,
}: {
	poId: number;
	prId?: number;
	pendingLines: PurchaseRequisitionItem[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const detailQuery = usePurchaseOrderDetailQuery(poId, open);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const po = detail?.po;
	const items = useMemo(() => detail?.items ?? [], [detail]);

	const [paymentTermsDays, setPaymentTermsDays] = useState("");
	const [deliveryTerms, setDeliveryTerms] = useState("");
	const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
	const [notes, setNotes] = useState("");
	const [rates, setRates] = useState<Record<number, string>>({});
	const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
	const [addedLineIds, setAddedLineIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [addedRates, setAddedRates] = useState<Record<number, string>>({});
	const updateMutation = useUpdatePurchaseOrderMutation();

	// Seed form state from the fetched PO exactly once per time the modal opens —
	// not on every `po`/`items` reference change, or a background refetch (e.g.
	// another tab drafting/cancelling a PO against the same PR, which invalidates
	// this PR's cache) would silently clobber whatever the user has already typed.
	const seededRef = useRef(false);
	useEffect(() => {
		if (!open) {
			seededRef.current = false;
			setRemovedIds(new Set());
			setAddedLineIds(new Set());
			setAddedRates({});
			return;
		}
		if (!po || seededRef.current) return;
		seededRef.current = true;

		setPaymentTermsDays(
			po.paymentTermsDays != null ? String(po.paymentTermsDays) : "",
		);
		setDeliveryTerms(po.deliveryTerms ?? "");
		setExpectedDeliveryDate(po.expectedDeliveryDate ?? "");
		setNotes(po.notes ?? "");
		setRates(
			Object.fromEntries(
				items.map((item) => [item.id, String(item.unitPricePaise / 100)]),
			),
		);
	}, [open, po, items]);

	const activeItems = items.filter((item) => !removedIds.has(item.id));
	const addedLines = pendingLines.filter((line) => addedLineIds.has(line.id));
	const addableLines = pendingLines.filter(
		(line) => !addedLineIds.has(line.id),
	);

	const totalPaise =
		activeItems.reduce(
			(sum, item) =>
				sum + Math.round(Number(rates[item.id] || 0) * 100 * item.qty),
			0,
		) +
		addedLines.reduce(
			(sum, line) =>
				sum +
				Math.round(Number(addedRates[line.id] || 0) * 100 * line.requestedQty),
			0,
		);

	function addLine(lineId: number, estRatePaise?: number | null) {
		setAddedLineIds((current) => new Set(current).add(lineId));
		setAddedRates((current) => ({
			...current,
			[lineId]: current[lineId] ?? String((estRatePaise ?? 0) / 100),
		}));
	}

	function undoAddLine(lineId: number) {
		setAddedLineIds((current) => {
			const next = new Set(current);
			next.delete(lineId);
			return next;
		});
	}

	function onSubmit() {
		if (!po) return;

		const updates = activeItems
			.filter(
				(item) =>
					Math.round(Number(rates[item.id] || 0) * 100) !== item.unitPricePaise,
			)
			.map((item) => ({
				id: item.id,
				unitPricePaise: Math.round(Number(rates[item.id] || 0) * 100),
			}));
		const deletes = [...removedIds].map((id) => ({ id }));
		const inserts = addedLines.map((line) => ({
			prItemId: line.id,
			unitPricePaise: Math.round(Number(addedRates[line.id] || 0) * 100),
		}));

		updateMutation.mutate(
			{
				prId,
				payload: {
					poId: po.id,
					paymentTermsDays: paymentTermsDays ? Number(paymentTermsDays) : null,
					deliveryTerms: deliveryTerms.trim() || null,
					notes: notes.trim() || null,
					expectedDeliveryDate: expectedDeliveryDate || null,
					updates,
					deletes,
					inserts,
				},
			},
			{
				onSuccess: (result) => {
					if (result.success) onSaved();
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="min-w-[min(56rem,calc(100vw-2rem))] gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>Edit {po?.poNumber ?? "PO"} · draft</DialogTitle>
					<DialogDescription>
						Supplier is locked once a PO is drafted. Quantities always match the
						PR line.
					</DialogDescription>
				</DialogHeader>

				{detailQuery.isLoading || !po ? (
					<div className="space-y-3 px-6 py-6">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-40 w-full" />
					</div>
				) : (
					<>
						<div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
							<div className="grid gap-3 md:grid-cols-[1fr_10rem_1fr]">
								<div>
									<span className="mb-1 block text-xs font-medium">
										Supplier
									</span>
									<div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
										Supplier #{po.supplierId}
									</div>
								</div>
								<div>
									<label
										htmlFor="po-edit-payment-terms-days"
										className="mb-1 block text-xs font-medium"
									>
										Terms
									</label>
									<Input
										id="po-edit-payment-terms-days"
										type="number"
										min={0}
										value={paymentTermsDays}
										onChange={(event) =>
											setPaymentTermsDays(event.target.value)
										}
									/>
								</div>
								<div>
									<label
										htmlFor="po-edit-expected-delivery-date"
										className="mb-1 block text-xs font-medium"
									>
										Delivery date
									</label>
									<Input
										id="po-edit-expected-delivery-date"
										type="date"
										value={expectedDeliveryDate}
										onChange={(event) =>
											setExpectedDeliveryDate(event.target.value)
										}
									/>
								</div>
							</div>

							<div className="space-y-2">
								{activeItems.map((item) => (
									<div
										key={item.id}
										className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_7rem_8rem_auto] md:items-center"
									>
										<div className="min-w-0">
											<span className="font-medium">
												{item.itemName ?? "-"}
											</span>
											<p className="text-xs text-muted-foreground">
												{item.qty} {item.uom ?? ""}
											</p>
										</div>
										<div className="relative">
											<IconCurrencyRupee className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
											<Input
												type="number"
												min={0}
												value={rates[item.id] ?? ""}
												onChange={(event) =>
													setRates((current) => ({
														...current,
														[item.id]: event.target.value,
													}))
												}
												className="pl-7"
											/>
										</div>
										<div className="text-right font-medium">
											{formatMoney(
												Math.round(
													Number(rates[item.id] || 0) * 100 * item.qty,
												),
											)}
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() =>
												setRemovedIds((current) =>
													new Set(current).add(item.id),
												)
											}
										>
											Remove
										</Button>
									</div>
								))}
								{activeItems.length === 0 ? (
									<p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
										{pendingLines.length > 0
											? "All lines removed — add a line below or discard this PO instead."
											: "All lines removed — this PO has no lines left. Discard it from the linked PR's detail page."}
									</p>
								) : null}
							</div>

							{addedLines.length > 0 ? (
								<div className="space-y-2">
									{addedLines.map((line) => (
										<div
											key={line.id}
											className="grid gap-3 rounded-md border border-dashed p-3 md:grid-cols-[1fr_7rem_8rem_auto] md:items-center"
										>
											<div className="min-w-0">
												<span className="font-medium">
													{line.itemName ?? "-"}
												</span>
												<p className="text-xs text-muted-foreground">
													{line.requestedQty} {line.uom ?? ""}
												</p>
											</div>
											<div className="relative">
												<IconCurrencyRupee className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
												<Input
													type="number"
													min={0}
													value={addedRates[line.id] ?? ""}
													onChange={(event) =>
														setAddedRates((current) => ({
															...current,
															[line.id]: event.target.value,
														}))
													}
													className="pl-7"
												/>
											</div>
											<div className="text-right font-medium">
												{formatMoney(
													Math.round(
														Number(addedRates[line.id] || 0) *
															100 *
															line.requestedQty,
													),
												)}
											</div>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => undoAddLine(line.id)}
											>
												Undo
											</Button>
										</div>
									))}
								</div>
							) : null}

							{addableLines.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{addableLines.map((line) => (
										<Button
											key={line.id}
											type="button"
											variant="outline"
											size="sm"
											onClick={() => addLine(line.id, line.estRatePaise)}
										>
											+ {line.itemName ?? "line"}
										</Button>
									))}
								</div>
							) : null}

							<div className="grid gap-3 md:grid-cols-2">
								<div>
									<label
										htmlFor="po-edit-delivery-terms"
										className="mb-1 block text-xs font-medium"
									>
										Delivery terms
									</label>
									<Input
										id="po-edit-delivery-terms"
										value={deliveryTerms}
										onChange={(event) => setDeliveryTerms(event.target.value)}
										placeholder="Door delivery, pickup, freight included"
									/>
								</div>
								<div>
									<label
										htmlFor="po-edit-notes"
										className="mb-1 block text-xs font-medium"
									>
										Notes
									</label>
									<Textarea
										id="po-edit-notes"
										value={notes}
										onChange={(event) => setNotes(event.target.value)}
										placeholder="Optional"
									/>
								</div>
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
								disabled={activeItems.length === 0 || updateMutation.isPending}
								onClick={onSubmit}
							>
								Save changes · {formatMoney(totalPaise)}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
