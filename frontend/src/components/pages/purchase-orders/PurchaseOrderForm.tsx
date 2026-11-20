"use client";

import Link from "next/link";
import type { FormEvent } from "react";

import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import {
	GST_PERCENT_VALUES,
	type PurchaseOrderItem,
} from "@/types/purchase-orders";

export type PoFormValues = {
	paymentTermsDays: string;
	deliveryTerms: string;
	expectedDeliveryDate: string;
	notes: string;
	rates: Record<number, string>;
	gsts: Record<number, string>;
};

export type PoFormTotals = {
	subtotalPaise: number;
	taxPaise: number;
	totalPaise: number;
};

export function poLineValuePaise(item: PurchaseOrderItem, rate: string) {
	return Math.round(Number(rate || 0) * 100 * item.qty);
}

const LABEL = "mb-1 block text-[13px] leading-[18px] font-semibold";

/** Draft order form body: details + lines left, Totals and "From PR" right (screens.md screen 8). */
export function PurchaseOrderForm({
	formId,
	onSubmit,
	serverError,
	supplierName,
	values,
	onChange,
	items,
	errors,
	totals,
	prLink,
}: {
	formId: string;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	serverError: string | null;
	supplierName: string;
	values: PoFormValues;
	onChange: (next: PoFormValues) => void;
	items: PurchaseOrderItem[];
	errors: Record<number, string>;
	totals: PoFormTotals;
	prLink: { id: number; number: string; canOpen: boolean } | null;
}) {
	return (
		<TwoPaneLayout
			sideLabel="Order summary"
			side={
				<>
					<div className="space-y-3 rounded-lg border bg-card p-4">
						<h2 className="font-heading text-base font-semibold">Totals</h2>
						<dl className="space-y-2 text-sm">
							<div className="flex justify-between gap-2">
								<dt className="text-muted-foreground">Lines</dt>
								<dd className="tabular-nums">{items.length}</dd>
							</div>
							<div className="flex justify-between gap-2">
								<dt className="text-muted-foreground">Subtotal</dt>
								<dd className="tabular-nums">
									{formatMoney(totals.subtotalPaise)}
								</dd>
							</div>
							<div className="flex justify-between gap-2">
								<dt className="text-muted-foreground">GST</dt>
								<dd className="tabular-nums">{formatMoney(totals.taxPaise)}</dd>
							</div>
							<div className="flex justify-between gap-2 font-semibold">
								<dt>Total</dt>
								<dd className="tabular-nums">
									{formatMoney(totals.totalPaise)}
								</dd>
							</div>
						</dl>
					</div>
					<div className="space-y-2 rounded-lg border bg-card p-4">
						<h2 className="font-heading text-base font-semibold">From PR</h2>
						{prLink ? (
							prLink.canOpen ? (
								<Link
									href={`/purchase-requisitions/${prLink.id}`}
									className="text-sm text-brand-accent hover:underline"
								>
									{prLink.number}
								</Link>
							) : (
								<p className="text-sm">{prLink.number}</p>
							)
						) : (
							<p className="text-sm text-muted-foreground">No requisition.</p>
						)}
					</div>
				</>
			}
		>
			<form
				id={formId}
				onSubmit={onSubmit}
				noValidate
				className="space-y-6"
				aria-label="Purchase order"
			>
				{serverError ? (
					<div
						role="alert"
						className="rounded-md border border-destructive bg-destructive-subtle p-3 text-sm text-destructive"
					>
						{serverError}
					</div>
				) : null}

				<section className="space-y-4 rounded-lg border bg-card p-4">
					<h2 className="font-heading text-base font-semibold">Details</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div>
							<label htmlFor="po-form-supplier" className={LABEL}>
								Supplier
							</label>
							<Input id="po-form-supplier" value={supplierName} disabled />
						</div>
						<div>
							<label htmlFor="po-form-terms" className={LABEL}>
								Payment terms (days)
							</label>
							<Input
								id="po-form-terms"
								type="number"
								min={0}
								value={values.paymentTermsDays}
								onChange={(e) =>
									onChange({ ...values, paymentTermsDays: e.target.value })
								}
							/>
						</div>
						<div>
							<label htmlFor="po-form-delivery-date" className={LABEL}>
								Expected delivery
							</label>
							<Input
								id="po-form-delivery-date"
								type="date"
								value={values.expectedDeliveryDate}
								onChange={(e) =>
									onChange({ ...values, expectedDeliveryDate: e.target.value })
								}
							/>
						</div>
						<div className="md:col-span-3">
							<label htmlFor="po-form-delivery-terms" className={LABEL}>
								Delivery terms
							</label>
							<Input
								id="po-form-delivery-terms"
								value={values.deliveryTerms}
								placeholder="Door delivery, pickup, freight included"
								onChange={(e) =>
									onChange({ ...values, deliveryTerms: e.target.value })
								}
							/>
						</div>
						<div className="md:col-span-3">
							<label htmlFor="po-form-notes" className={LABEL}>
								Notes
							</label>
							<Textarea
								id="po-form-notes"
								value={values.notes}
								placeholder="Optional"
								onChange={(e) => onChange({ ...values, notes: e.target.value })}
							/>
						</div>
					</div>
				</section>

				<section className="space-y-4 rounded-lg border bg-card p-4">
					<h2 className="font-heading text-base font-semibold">Lines</h2>
					<ul className="space-y-4">
						{items.map((item) => {
							const name = item.itemName ?? `Item ${item.itemId}`;
							const error = errors[item.id];
							return (
								<li
									key={item.id}
									className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_8rem_8rem]"
								>
									<div className="min-w-0">
										<span className={LABEL}>Item</span>
										<p className="flex h-9 items-center truncate text-sm font-medium">
											{name}
										</p>
									</div>
									<div>
										<label htmlFor={`po-form-qty-${item.id}`} className={LABEL}>
											Quantity
										</label>
										<div className="relative">
											<Input
												id={`po-form-qty-${item.id}`}
												value={item.qty}
												disabled
												className="pr-12 text-right tabular-nums"
											/>
											{item.uom ? (
												<span
													aria-hidden="true"
													className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
												>
													{item.uom}
												</span>
											) : null}
										</div>
									</div>
									<div>
										<label
											htmlFor={`po-form-rate-${item.id}`}
											className={LABEL}
										>
											Rate
										</label>
										<div className="relative">
											<span
												aria-hidden="true"
												className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
											>
												₹
											</span>
											<Input
												id={`po-form-rate-${item.id}`}
												type="number"
												min={0}
												step="0.01"
												value={values.rates[item.id] ?? ""}
												aria-invalid={error ? true : undefined}
												className="pl-7 text-right tabular-nums"
												onChange={(e) =>
													onChange({
														...values,
														rates: {
															...values.rates,
															[item.id]: e.target.value,
														},
													})
												}
											/>
										</div>
									</div>
									<div>
										<label htmlFor={`po-form-gst-${item.id}`} className={LABEL}>
											GST
										</label>
										<Select
											value={values.gsts[item.id] ?? "0"}
											onValueChange={(value) =>
												onChange({
													...values,
													gsts: { ...values.gsts, [item.id]: value },
												})
											}
										>
											<SelectTrigger
												id={`po-form-gst-${item.id}`}
												className="w-full"
											>
												<SelectValue placeholder="GST %" />
											</SelectTrigger>
											<SelectContent>
												{GST_PERCENT_VALUES.map((gst) => (
													<SelectItem key={gst} value={String(gst)}>
														{gst}%
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div>
										<span className={LABEL}>Amount</span>
										<p className="flex h-9 items-center justify-end text-sm font-medium tabular-nums">
											{formatMoney(
												poLineValuePaise(item, values.rates[item.id] ?? ""),
											)}
										</p>
									</div>
									{error ? (
										<p
											role="alert"
											className="text-sm text-destructive md:col-span-5"
										>
											{error}
										</p>
									) : null}
								</li>
							);
						})}
					</ul>
					<p className="text-sm text-muted-foreground">
						Quantities match the requisition lines and cannot be changed here.
					</p>
				</section>
			</form>
		</TwoPaneLayout>
	);
}
