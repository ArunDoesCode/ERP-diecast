"use client";

import { IconFileInvoice } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
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
	type PoDraftGroup,
	type PoDraftOutcome,
	useCreateDraftPosMutation,
} from "@/lib/api/purchase-orders/queries";
import type { PrPageItem } from "@/lib/api/purchase-requisitions/detail-types";
import { useSupplierLookupQuery } from "@/lib/api/suppliers/queries";

type Pick = { supplierId?: number; supplierName?: string; rate: string };

/** A line goes to the dialog when it has no default supplier or no usable rate (BR-FF-49, 92). */
function needsSupplier(line: PrPageItem) {
	return line.defaultSupplierId == null;
}
function needsRate(line: PrPageItem) {
	return !(line.suggestedRatePaise != null && line.suggestedRatePaise > 0);
}

function toPaise(rate: string) {
	const value = Number(rate);
	return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

/**
 * Create PO (BR-FF-48, 49, 58, 59, 92): one click makes one draft PO per supplier. The dialog opens
 * only when a pending line has no default supplier or a missing / 0 rate; no order is made until
 * it is confirmed.
 */
export function CreatePoAction({
	prId,
	pendingLines,
}: {
	prId: number;
	pendingLines: PrPageItem[];
}) {
	const router = useRouter();
	const create = useCreateDraftPosMutation();
	const [open, setOpen] = useState(false);
	const [picks, setPicks] = useState<Record<number, Pick>>({});
	const [submitted, setSubmitted] = useState(false);
	const [supplierSearch, setSupplierSearch] = useState("");
	const supplierLookup = useSupplierLookupQuery(supplierSearch, 20);

	const askLines = useMemo(
		() => pendingLines.filter((l) => needsSupplier(l) || needsRate(l)),
		[pendingLines],
	);
	const supplierOptions = useMemo(
		() =>
			(supplierLookup.data?.pages ?? [])
				.flatMap((page) => page.data)
				.map<SearchableSelectOption>((s) => ({
					value: String(s.id),
					label: s.name,
					secondaryLabel: s.isActive ? undefined : "Inactive",
				})),
		[supplierLookup.data],
	);

	function pickOf(line: PrPageItem): Pick {
		return picks[line.id] ?? { rate: "" };
	}

	function lineErrors(line: PrPageItem) {
		const pick = pickOf(line);
		return {
			supplier:
				needsSupplier(line) && pick.supplierId == null
					? "Pick a supplier"
					: null,
			rate:
				needsRate(line) && !(toPaise(pick.rate) >= 1) ? "Enter a rate" : null,
		};
	}

	async function run() {
		const byId = new Map<number, PoDraftGroup>();
		for (const line of pendingLines) {
			const pick = picks[line.id];
			const supplierId = needsSupplier(line)
				? pick?.supplierId
				: (line.defaultSupplierId ?? undefined);
			if (supplierId == null) continue;
			const supplierName = needsSupplier(line)
				? (pick?.supplierName ?? `Supplier ${supplierId}`)
				: (line.defaultSupplierName ?? `Supplier ${supplierId}`);
			const unitPricePaise = needsRate(line)
				? toPaise(pick?.rate ?? "")
				: (line.suggestedRatePaise ?? 0);
			const group = byId.get(supplierId) ?? {
				supplierId,
				supplierName,
				lines: [],
			};
			group.lines.push({ prItemId: line.id, unitPricePaise });
			byId.set(supplierId, group);
		}

		const outcomes = await create.mutateAsync({
			prId,
			groups: [...byId.values()],
		});
		setOpen(false);
		report(outcomes);
	}

	function report(outcomes: PoDraftOutcome[]) {
		const made = outcomes.filter((o) => o.ok);
		const failed = outcomes.filter((o) => !o.ok);
		for (const f of failed) {
			if (!f.ok) toast.error(`${f.supplierName}: ${f.message}`);
		}
		if (made.length === 1 && failed.length === 0) {
			const only = made[0];
			if (only.ok) router.push(`/purchase-orders/${only.po.id}`);
			return;
		}
		if (made.length > 0) {
			toast.success(
				`${made.length} draft order${made.length > 1 ? "s" : ""} made: ${made
					.map((o) => (o.ok ? o.po.poNumber : ""))
					.join(", ")}`,
			);
		}
		// BR-FF-59: the mutation refreshed the page queries, so a conflict shows the new state.
	}

	function onClick() {
		if (pendingLines.length === 0) return;
		if (askLines.length > 0) {
			setSubmitted(false);
			setOpen(true);
			return;
		}
		void run();
	}

	function onConfirm() {
		setSubmitted(true);
		if (askLines.some((l) => lineErrors(l).supplier || lineErrors(l).rate))
			return;
		void run();
	}

	return (
		<>
			<Button type="button" disabled={create.isPending} onClick={onClick}>
				<IconFileInvoice className="size-3.5" />
				{create.isPending ? "Making orders…" : "Create PO"}
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => !create.isPending && setOpen(next)}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Create purchase order</DialogTitle>
						<DialogDescription>
							These lines need a little more before the orders can be made. No
							order is made until you confirm.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[60vh] space-y-4 overflow-y-auto">
						{askLines.map((line) => {
							const pick = pickOf(line);
							const errs = submitted ? lineErrors(line) : null;
							const name = line.itemName ?? "line";
							return (
								<fieldset
									key={line.id}
									className="space-y-3 rounded-md border p-3"
								>
									<legend className="px-1 text-sm font-medium">{name}</legend>
									{needsSupplier(line) ? (
										<div className="space-y-1.5">
											<span
												id={`po-supplier-label-${line.id}`}
												className="block text-[13px] leading-[18px] font-semibold"
											>
												Supplier for {name}
											</span>
											<SearchableSelect
												value={
													pick.supplierId != null
														? String(pick.supplierId)
														: undefined
												}
												options={supplierOptions}
												onValueChange={(value) =>
													setPicks((c) => ({
														...c,
														[line.id]: {
															...pickOf(line),
															supplierId: Number(value),
															supplierName: supplierOptions.find(
																(o) => o.value === value,
															)?.label,
														},
													}))
												}
												searchValue={supplierSearch}
												onSearchChange={setSupplierSearch}
												placeholder="Select supplier"
												searchPlaceholder="Search supplier"
												emptyText="Type to search suppliers"
												isLoading={supplierLookup.isLoading}
												hasNextPage={supplierLookup.hasNextPage}
												isFetchingNextPage={supplierLookup.isFetchingNextPage}
												onReachEnd={() => {
													void supplierLookup.fetchNextPage();
												}}
											/>
											{errs?.supplier ? (
												<p role="alert" className="text-sm text-destructive">
													{errs.supplier}
												</p>
											) : null}
										</div>
									) : (
										<p className="text-sm text-muted-foreground">
											Supplier: {line.defaultSupplierName}
										</p>
									)}
									{needsRate(line) ? (
										<div className="space-y-1.5">
											<label
												htmlFor={`po-rate-${line.id}`}
												className="block text-[13px] leading-[18px] font-semibold"
											>
												Rate for {name}
												{line.uom ? ` (per ${line.uom})` : ""}
											</label>
											<div className="relative">
												<span
													aria-hidden="true"
													className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
												>
													₹
												</span>
												<Input
													id={`po-rate-${line.id}`}
													type="number"
													min={0.01}
													step="0.01"
													className="pl-7 text-right tabular-nums"
													value={pick.rate}
													aria-invalid={errs?.rate ? true : undefined}
													onChange={(event) =>
														setPicks((c) => ({
															...c,
															[line.id]: {
																...pickOf(line),
																rate: event.target.value,
															},
														}))
													}
												/>
											</div>
											{errs?.rate ? (
												<p role="alert" className="text-sm text-destructive">
													{errs.rate}
												</p>
											) : null}
										</div>
									) : null}
								</fieldset>
							);
						})}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={create.isPending}
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={create.isPending}
							onClick={onConfirm}
						>
							{create.isPending ? "Making orders…" : "Create PO"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
