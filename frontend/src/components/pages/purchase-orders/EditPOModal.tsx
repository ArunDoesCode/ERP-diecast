"use client";

import { IconCurrencyRupee } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
	ContractRateControls,
	overrideReasonValid,
} from "@/components/pages/purchase-orders/ContractRateControls";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import {
	poErrorMessage,
	useItemsLastRatesQuery,
	usePurchaseOrderDetailQuery,
	useSupplierPriceRowsQuery,
	useUpdatePurchaseOrderMutation,
} from "@/lib/api/purchase-orders/queries";
import { formatMoney } from "@/lib/format";
import {
	GST_PERCENT_VALUES,
	suggestedRateInput,
} from "@/types/purchase-orders";
import type { PurchaseRequisitionItem } from "@/types/purchase-requisitions";

function GstSelect({
	id,
	value,
	onChange,
	disabled,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	return (
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger id={id} className="w-full" aria-label="GST percent">
				<SelectValue placeholder="GST %" />
			</SelectTrigger>
			<SelectContent>
				{GST_PERCENT_VALUES.map((gst) => (
					<SelectItem key={gst} value={String(gst)}>
						GST {gst}%
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
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
	const [gsts, setGsts] = useState<Record<number, string>>({});
	const [addedGsts, setAddedGsts] = useState<Record<number, string>>({});
	const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
	const [addedLineIds, setAddedLineIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [addedRates, setAddedRates] = useState<Record<number, string>>({});
	const updateMutation = useUpdatePurchaseOrderMutation();
	const canOverrideRate = useCan("contract.override_rate");
	// Contract-linked lines: rate and GST are fixed; an override needs a reason (BR-RFQ-50, 51).
	const [overrides, setOverrides] = useState<
		Record<number, { on: boolean; reason: string }>
	>({});
	const [showOverrideErrors, setShowOverrideErrors] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	// GST % for newly added lines comes from the supplier's active price list,
	// read for exactly the lines that can be added (#107: no 100-row cap).
	const priceRowsQuery = useSupplierPriceRowsQuery(
		po?.supplierId ?? 0,
		pendingLines.map((line) => line.itemId),
		open && Boolean(po),
	);
	// Qty left on each contract line, for the contract badge.
	const lastRatesQuery = useItemsLastRatesQuery(
		items.filter((item) => item.contractItemId != null).map((i) => i.itemId),
		po?.supplierId ?? 0,
		open && Boolean(po),
	);
	const catalogGstByItemId = useMemo(() => {
		const map = new Map<number, number>();
		for (const item of priceRowsQuery.data ?? []) {
			if (item.isActive === false || item.taxPercentage == null) continue;
			map.set(item.itemId, item.taxPercentage);
		}
		return map;
	}, [priceRowsQuery.data]);

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
			setAddedGsts({});
			setOverrides({});
			setShowOverrideErrors(false);
			setSubmitError(null);
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
		setGsts(
			Object.fromEntries(
				items.map((item) => [item.id, String(item.gstPercent ?? 0)]),
			),
		);
		// A line with a saved override starts in override mode (CR-01).
		setOverrides(
			Object.fromEntries(
				items
					.filter((item) => item.rateOverrideReason)
					.map((item) => [
						item.id,
						{ on: true, reason: item.rateOverrideReason ?? "" },
					]),
			),
		);
	}, [open, po, items]);

	const activeItems = items.filter((item) => !removedIds.has(item.id));
	const addedLines = pendingLines.filter((line) => addedLineIds.has(line.id));
	const addableLines = pendingLines.filter(
		(line) => !addedLineIds.has(line.id),
	);

	// BR-PO-04: line tax = round(line value x GST % / 100), summed per line.
	function lineTotal(valuePaise: number, gst: string | undefined) {
		return valuePaise + Math.round((valuePaise * Number(gst || 0)) / 100);
	}
	const totalPaise =
		activeItems.reduce(
			(sum, item) =>
				sum +
				lineTotal(
					Math.round(Number(rates[item.id] || 0) * 100 * item.qty),
					gsts[item.id],
				),
			0,
		) +
		addedLines.reduce(
			(sum, line) =>
				sum +
				lineTotal(
					Math.round(
						Number(addedRates[line.id] || 0) * 100 * line.requestedQty,
					),
					addedGsts[line.id],
				),
			0,
		);

	function addLine(
		lineId: number,
		itemId: number,
		estRatePaise?: number | null,
	) {
		setAddedLineIds((current) => new Set(current).add(lineId));
		setAddedRates((current) => ({
			...current,
			// BR-PO-25: a 0 suggestion is not prefilled.
			[lineId]: current[lineId] ?? suggestedRateInput(estRatePaise),
		}));
		setAddedGsts((current) => ({
			...current,
			[lineId]: current[lineId] ?? String(catalogGstByItemId.get(itemId) ?? 0),
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
		setSubmitError(null);
		setShowOverrideErrors(true);
		if (
			activeItems.some((item) => {
				const entry = overrides[item.id];
				return entry?.on && !overrideReasonValid(entry.reason);
			})
		) {
			return;
		}

		const updates = activeItems
			.filter(
				(item) =>
					Math.round(Number(rates[item.id] || 0) * 100) !==
						item.unitPricePaise ||
					Number(gsts[item.id] ?? 0) !== (item.gstPercent ?? 0),
			)
			.map((item) => ({
				id: item.id,
				unitPricePaise: Math.round(Number(rates[item.id] || 0) * 100),
				gstPercent: Number(gsts[item.id] ?? 0),
				rateOverrideReason: overrides[item.id]?.on
					? overrides[item.id].reason.trim()
					: undefined,
			}));
		const deletes = [...removedIds].map((id) => ({ id }));
		const inserts = addedLines.map((line) => ({
			prItemId: line.id,
			unitPricePaise: Math.round(Number(addedRates[line.id] || 0) * 100),
			gstPercent: Number(addedGsts[line.id] ?? 0),
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
				onError: (error) =>
					setSubmitError(poErrorMessage(error, "Failed to update PO")),
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
									<span className="mb-1 block text-[13px] leading-[18px] font-semibold">
										Supplier
									</span>
									<div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
										{po.supplierName}
									</div>
								</div>
								<div>
									<label
										htmlFor="po-edit-payment-terms-days"
										className="mb-1 block text-[13px] leading-[18px] font-semibold"
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
										className="mb-1 block text-[13px] leading-[18px] font-semibold"
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
								{activeItems.map((item) => {
									const contractLinked = item.contractItemId != null;
									const override = overrides[item.id];
									const rateLocked = contractLinked && !override?.on;
									return (
										<div
											key={item.id}
											className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_7rem_7rem_8rem_auto] md:items-center"
										>
											<div className="min-w-0">
												<span className="font-medium">
													{item.itemName ?? "-"}
												</span>
												<p className="text-sm text-muted-foreground">
													{item.qty} {item.uom ?? ""}
												</p>
												{item.quoteNumber ? (
													<p className="text-[13px] text-muted-foreground">
														From quote {item.quoteNumber}
													</p>
												) : null}
											</div>
											<div className="relative">
												<IconCurrencyRupee className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
												<Input
													aria-label={`Rate for ${item.itemName ?? "line"}`}
													type="number"
													min={0}
													readOnly={rateLocked}
													aria-readonly={rateLocked || undefined}
													value={
														rateLocked && rates[item.id]
															? Number(rates[item.id]).toFixed(2)
															: (rates[item.id] ?? "")
													}
													onChange={(event) =>
														setRates((current) => ({
															...current,
															[item.id]: event.target.value,
														}))
													}
													className={`pl-7 text-right tabular-nums ${rateLocked ? "cursor-not-allowed border-dashed bg-muted text-muted-foreground" : ""}`}
												/>
											</div>
											<GstSelect
												id={`po-edit-line-gst-${item.id}`}
												disabled={contractLinked}
												value={gsts[item.id] ?? "0"}
												onChange={(value) =>
													setGsts((current) => ({
														...current,
														[item.id]: value,
													}))
												}
											/>
											<div className="text-right font-medium tabular-nums">
												{formatMoney(
													Math.round(
														Number(rates[item.id] || 0) * 100 * item.qty,
													),
												)}
											</div>
											{/* A line from an RFQ award can't be removed (A-43). */}
											{item.quoteItemId != null ? (
												<span
													className="text-[13px] text-muted-foreground"
													title="This line came from an RFQ award. Cancel the PO to undo the award."
												>
													From award
												</span>
											) : (
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
											)}
											{contractLinked ? (
												<ContractRateControls
													idPrefix={`po-edit-line-${item.id}`}
													contractNumber={item.contractNumber}
													qtyLeft={lastRatesQuery.data?.[item.itemId]?.qtyLeft}
													unit={item.uom}
													contractId={
														lastRatesQuery.data?.[item.itemId]?.contractId
													}
													itemId={item.itemId}
													canOverride={canOverrideRate}
													overriding={override?.on ?? false}
													onOverridingChange={(on) => {
														setOverrides((current) => ({
															...current,
															[item.id]: {
																on,
																reason: on
																	? (current[item.id]?.reason ?? "")
																	: "",
															},
														}));
														if (!on) {
															setRates((current) => ({
																...current,
																[item.id]: String(
																	(item.contractRatePaise ??
																		item.unitPricePaise) / 100,
																),
															}));
														}
													}}
													reason={override?.reason ?? ""}
													onReasonChange={(reason) =>
														setOverrides((current) => ({
															...current,
															[item.id]: { on: true, reason },
														}))
													}
													showReasonError={showOverrideErrors}
												/>
											) : null}
											{item.rateOverrideReason ? (
												<p className="text-[13px] text-muted-foreground md:col-span-full">
													Override
													{item.contractRatePaise != null
														? ` · was ${formatMoney(item.contractRatePaise)}`
														: ""}
													{` · ${item.rateOverrideReason}`}
													{item.rateOverrideByName
														? ` · by ${item.rateOverrideByName}`
														: ""}
												</p>
											) : null}
										</div>
									);
								})}
								{activeItems.length === 0 ? (
									<p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
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
											className="grid gap-3 rounded-md border border-dashed p-3 md:grid-cols-[1fr_7rem_7rem_8rem_auto] md:items-center"
										>
											<div className="min-w-0">
												<span className="font-medium">
													{line.itemName ?? "-"}
												</span>
												<p className="text-sm text-muted-foreground">
													{line.requestedQty} {line.uom ?? ""}
												</p>
											</div>
											<div className="relative">
												<IconCurrencyRupee className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
												<Input
													aria-label={`Rate for ${line.itemName ?? "line"}`}
													type="number"
													min={0}
													value={addedRates[line.id] ?? ""}
													onChange={(event) =>
														setAddedRates((current) => ({
															...current,
															[line.id]: event.target.value,
														}))
													}
													className="pl-7 text-right tabular-nums"
												/>
											</div>
											<GstSelect
												id={`po-edit-added-gst-${line.id}`}
												value={addedGsts[line.id] ?? "0"}
												onChange={(value) =>
													setAddedGsts((current) => ({
														...current,
														[line.id]: value,
													}))
												}
											/>
											<div className="text-right font-medium tabular-nums">
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
											onClick={() =>
												addLine(line.id, line.itemId, line.estRatePaise)
											}
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
										className="mb-1 block text-[13px] leading-[18px] font-semibold"
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
										className="mb-1 block text-[13px] leading-[18px] font-semibold"
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

						{submitError ? (
							<div
								role="alert"
								className="mx-6 mb-3 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
							>
								{submitError}
							</div>
						) : null}

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
								{updateMutation.isPending
									? "Saving…"
									: `Save changes · ${formatMoney(totalPaise)} incl. GST`}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
