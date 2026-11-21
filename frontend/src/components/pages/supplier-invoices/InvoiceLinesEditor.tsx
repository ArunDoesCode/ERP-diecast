"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";

import type {
	CatalogLine,
	ChargeRow,
	ItemRow,
} from "@/components/pages/supplier-invoices/invoice-form-types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatMoney, formatQtyTrim } from "@/lib/format";
import {
	gstPercentToBp,
	lineTaxable,
	matchLine,
	parseQty,
	rupeesToPaise,
} from "@/lib/supplier-invoice-calc";
import {
	SINV_CHARGE_TYPE_LABEL,
	SINV_GST_PERCENTS,
	SINV_MAX_CHARGES,
	type SinvChargeType,
} from "@/types/supplier-invoice";

export type RowErrors = { qty?: string; rate?: string; gst?: string };

/** Field errors of one item row (shown after the first save / submit try). */
export function itemRowErrors(row: ItemRow, line: CatalogLine): RowErrors {
	const errors: RowErrors = {};
	if (parseQty(row.qty, line.uom) === null) {
		errors.qty = ["pcs", "set", "sets", "nos"].includes(line.uom.toLowerCase())
			? "Whole number above 0"
			: "Above 0, up to 3 decimals";
	}
	const rate = rupeesToPaise(row.rate);
	if (rate === null || rate < 1) errors.rate = "Rate needed";
	if (row.gst === "") errors.gst = "GST needed";
	return errors;
}

export function chargeRowErrors(row: ChargeRow): {
	description?: string;
	taxable?: string;
	gst?: string;
} {
	const errors: { description?: string; taxable?: string; gst?: string } = {};
	const taxable = rupeesToPaise(row.taxable);
	if (taxable === null || taxable < 1) errors.taxable = "Amount needed";
	if (row.gst === "") errors.gst = "GST needed";
	if (row.type === "other" && row.description.trim() === "") {
		errors.description = "Describe the charge";
	}
	return errors;
}

function GstSelect({
	id,
	label,
	value,
	disabled,
	invalid,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	disabled: boolean;
	invalid: boolean;
	onChange: (value: string) => void;
}) {
	return (
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger
				id={id}
				aria-label={label}
				aria-invalid={invalid || undefined}
				className="w-full min-w-24"
			>
				<SelectValue placeholder="GST" />
			</SelectTrigger>
			<SelectContent>
				{SINV_GST_PERCENTS.map((percent) => (
					<SelectItem key={percent} value={String(percent)}>
						{percent}%
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function InvoiceLinesEditor({
	catalog,
	rows,
	priceTolBp,
	weightTolBp,
	showErrors,
	disabled,
	onChange,
	onRemove,
	onAdd,
}: {
	catalog: CatalogLine[];
	rows: ItemRow[];
	priceTolBp: number;
	weightTolBp: number;
	showErrors: boolean;
	disabled: boolean;
	onChange: (grnItemId: number, patch: Partial<ItemRow>) => void;
	onRemove: (grnItemId: number) => void;
	onAdd: (line: CatalogLine) => void;
}) {
	const byId = new Map(catalog.map((line) => [line.grnItemId, line]));
	const additions = catalog.filter(
		(line) => !rows.some((row) => row.grnItemId === line.grnItemId),
	);
	return (
		<div className="flex flex-col gap-3">
			<ul className="flex flex-col gap-3">
				{rows.map((row) => {
					const line = byId.get(row.grnItemId);
					if (!line) return null;
					const errors = showErrors ? itemRowErrors(row, line) : {};
					const qty = parseQty(row.qty, line.uom);
					const rate = rupeesToPaise(row.rate);
					const gst = row.gst === "" ? null : Number(row.gst);
					const live =
						qty !== null && rate !== null && rate > 0 && gst !== null;
					const match = live
						? matchLine(
								{
									uom: line.uom,
									qty,
									ratePaise: rate,
									gstBp: gstPercentToBp(gst),
									billableQty: line.billableQty,
									poRatePaise: line.poRatePaise,
									poGstBp: gstPercentToBp(line.poGstPercent),
								},
								priceTolBp,
								weightTolBp,
							)
						: null;
					const base = `sinv-line-${row.grnItemId}`;
					return (
						<li
							key={row.grnItemId}
							className="flex flex-col gap-3 rounded-md border p-3"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="text-sm font-medium">{line.itemName}</p>
									<p className="text-[13px] text-muted-foreground">
										<span className="font-mono">{line.grnNumber}</span> ·
										Billable {formatQtyTrim(line.billableQty, line.uom)}
									</p>
								</div>
								<Button
									type="button"
									size="icon-sm"
									variant="ghost"
									aria-label={`Remove ${line.itemName} (${line.grnNumber})`}
									disabled={disabled}
									onClick={() => onRemove(row.grnItemId)}
								>
									<IconTrash />
								</Button>
							</div>
							<div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${base}-qty`}>
										Billed qty ({line.uom}) *
									</Label>
									<Input
										id={`${base}-qty`}
										inputMode="decimal"
										value={row.qty}
										disabled={disabled}
										aria-invalid={errors.qty ? true : undefined}
										className="text-right tabular-nums"
										onChange={(event) =>
											onChange(row.grnItemId, { qty: event.target.value })
										}
									/>
									{errors.qty ? (
										<p className="text-[13px] text-destructive">{errors.qty}</p>
									) : null}
								</div>
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${base}-rate`}>Rate ₹ *</Label>
									<Input
										id={`${base}-rate`}
										inputMode="decimal"
										value={row.rate}
										disabled={disabled}
										aria-invalid={errors.rate ? true : undefined}
										className="text-right tabular-nums"
										onChange={(event) =>
											onChange(row.grnItemId, { rate: event.target.value })
										}
									/>
									{errors.rate ? (
										<p className="text-[13px] text-destructive">
											{errors.rate}
										</p>
									) : null}
								</div>
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${base}-gst`}>GST % *</Label>
									<GstSelect
										id={`${base}-gst`}
										label={`GST % for ${line.itemName}`}
										value={row.gst}
										disabled={disabled}
										invalid={Boolean(errors.gst)}
										onChange={(value) =>
											onChange(row.grnItemId, { gst: value })
										}
									/>
									{errors.gst ? (
										<p className="text-[13px] text-destructive">{errors.gst}</p>
									) : null}
								</div>
							</div>
							<dl className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-2 text-sm">
								<div className="flex gap-2">
									<dt className="text-muted-foreground">PO rate</dt>
									<dd className="tabular-nums">
										{formatMoney(line.poRatePaise)}
									</dd>
								</div>
								<div className="flex gap-2">
									<dt className="text-muted-foreground">Taxable</dt>
									<dd className="tabular-nums">
										{live ? formatMoney(lineTaxable(qty, rate)) : "–"}
									</dd>
								</div>
								<div className="flex items-center gap-2">
									<dt className="text-muted-foreground">Match</dt>
									<dd>
										{match ? (
											<span className="flex flex-wrap gap-1">
												{match.checks.length === 0 ? (
													<StatusBadge doc="supplierInvoiceMatch" status="ok" />
												) : (
													match.checks.map((check) => (
														<StatusBadge
															key={check}
															doc="supplierInvoiceMatch"
															status={check}
														/>
													))
												)}
												{match.belowPoRate ? (
													<StatusBadge
														doc="supplierInvoiceMatch"
														status="below_po_rate"
													/>
												) : null}
											</span>
										) : (
											"–"
										)}
									</dd>
								</div>
							</dl>
						</li>
					);
				})}
			</ul>
			{additions.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{additions.map((line) => (
						<Button
							key={line.grnItemId}
							type="button"
							size="sm"
							variant="outline"
							disabled={disabled}
							onClick={() => onAdd(line)}
						>
							<IconPlus />
							Add {line.itemName} · {line.grnNumber}
						</Button>
					))}
				</div>
			) : null}
		</div>
	);
}

export function InvoiceChargesEditor({
	rows,
	showErrors,
	disabled,
	onChange,
	onRemove,
	onAdd,
}: {
	rows: ChargeRow[];
	showErrors: boolean;
	disabled: boolean;
	onChange: (key: string, patch: Partial<ChargeRow>) => void;
	onRemove: (key: string) => void;
	onAdd: () => void;
}) {
	return (
		<div className="flex flex-col gap-3">
			{rows.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Type *</TableHead>
							<TableHead>Description</TableHead>
							<TableHead className="text-right">Taxable ₹ *</TableHead>
							<TableHead>GST % *</TableHead>
							<TableHead className="w-10">
								<span className="sr-only">Remove</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row, index) => {
							const errors = showErrors ? chargeRowErrors(row) : {};
							const base = `sinv-charge-${row.key}`;
							return (
								<TableRow key={row.key}>
									<TableCell>
										<Select
											value={row.type}
											disabled={disabled}
											onValueChange={(value) =>
												onChange(row.key, { type: value as SinvChargeType })
											}
										>
											<SelectTrigger
												id={`${base}-type`}
												aria-label={`Charge ${index + 1} type`}
												className="w-32"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{(
													Object.keys(
														SINV_CHARGE_TYPE_LABEL,
													) as SinvChargeType[]
												).map((type) => (
													<SelectItem key={type} value={type}>
														{SINV_CHARGE_TYPE_LABEL[type]}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="min-w-48">
										<label htmlFor={`${base}-desc`} className="sr-only">
											Charge {index + 1} description
										</label>
										<Input
											id={`${base}-desc`}
											value={row.description}
											maxLength={200}
											disabled={disabled}
											aria-invalid={errors.description ? true : undefined}
											onChange={(event) =>
												onChange(row.key, { description: event.target.value })
											}
										/>
										{errors.description ? (
											<p className="mt-1 text-[13px] whitespace-normal text-destructive">
												{errors.description}
											</p>
										) : null}
									</TableCell>
									<TableCell className="min-w-32 text-right">
										<label htmlFor={`${base}-taxable`} className="sr-only">
											Charge {index + 1} taxable amount in rupees
										</label>
										<Input
											id={`${base}-taxable`}
											inputMode="decimal"
											value={row.taxable}
											disabled={disabled}
											aria-invalid={errors.taxable ? true : undefined}
											className="ml-auto w-28 text-right tabular-nums"
											onChange={(event) =>
												onChange(row.key, { taxable: event.target.value })
											}
										/>
										{errors.taxable ? (
											<p className="mt-1 text-[13px] whitespace-normal text-destructive">
												{errors.taxable}
											</p>
										) : null}
									</TableCell>
									<TableCell>
										<GstSelect
											id={`${base}-gst`}
											label={`Charge ${index + 1} GST %`}
											value={row.gst}
											disabled={disabled}
											invalid={Boolean(errors.gst)}
											onChange={(value) => onChange(row.key, { gst: value })}
										/>
										{errors.gst ? (
											<p className="mt-1 text-[13px] whitespace-normal text-destructive">
												{errors.gst}
											</p>
										) : null}
									</TableCell>
									<TableCell>
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label={`Remove charge ${index + 1}`}
											disabled={disabled}
											onClick={() => onRemove(row.key)}
										>
											<IconTrash />
										</Button>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			) : null}
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={disabled || rows.length >= SINV_MAX_CHARGES}
					onClick={onAdd}
				>
					<IconPlus />
					Add charge ({rows.length}/{SINV_MAX_CHARGES})
				</Button>
				<p className="text-[13px] text-muted-foreground">
					Charge lines need a release.
				</p>
			</div>
		</div>
	);
}
