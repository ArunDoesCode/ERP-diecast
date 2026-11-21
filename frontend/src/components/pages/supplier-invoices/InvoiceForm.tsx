"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
	chargeRowErrors,
	InvoiceChargesEditor,
	InvoiceLinesEditor,
	itemRowErrors,
} from "@/components/pages/supplier-invoices/InvoiceLinesEditor";
import {
	InvoiceTotalsPanel,
	printedOverTolerance,
} from "@/components/pages/supplier-invoices/InvoiceTotalsPanel";
import type {
	CatalogLine,
	ChargeRow,
	ItemRow,
	PrintedText,
} from "@/components/pages/supplier-invoices/invoice-form-types";
import { PageHeader } from "@/components/shared/PageHeader";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError } from "@/lib/api/client";
import {
	sinvErrorMessage,
	useCreateSupplierInvoiceMutation,
	useSubmitSupplierInvoiceMutation,
	useUpdateSupplierInvoiceMutation,
} from "@/lib/api/supplier-invoice/queries";
import { formatDate } from "@/lib/format";
import {
	addDays,
	computeTotals,
	gstPercentToBp,
	guessTaxType,
	matchLine,
	paiseToRupeeText,
	parseQty,
	percentToBp,
	rupeesToPaise,
	todayIst,
} from "@/lib/supplier-invoice-calc";
import {
	SINV_INVOICE_NUMBER_PATTERN,
	SINV_MAX_CHARGES,
	type SinvChargeInput,
	type SinvDetail,
	type SinvLineInput,
} from "@/types/supplier-invoice";

export type InvoiceFormSource = {
	poId: number;
	poNumber: string;
	supplier: { id: number; name: string; gstin: string | null };
	paymentTermsDays: number;
	/** Parent PR id for the "Back to PO" link; null falls back to tracking. */
	prId?: number | null;
	catalog: CatalogLine[];
};

function Field({
	id,
	label,
	hint,
	error,
	children,
	className,
}: {
	id: string;
	label: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={`min-h-19 space-y-1 ${className ?? ""}`}>
			<Label htmlFor={id}>{label}</Label>
			{children}
			{error ? (
				<p className="text-[13px] text-destructive">{error}</p>
			) : hint ? (
				<p className="text-[13px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

function catalogRow(line: CatalogLine): ItemRow {
	return {
		grnItemId: line.grnItemId,
		qty: String(line.billableQty),
		rate: paiseToRupeeText(line.poRatePaise),
		gst: String(line.poGstPercent),
	};
}

function initialItems(source: InvoiceFormSource, existing?: SinvDetail) {
	if (existing) {
		return existing.lines
			.filter((line) => line.kind === "item" && line.grnItemId !== null)
			.map<ItemRow>((line) => ({
				grnItemId: line.grnItemId as number,
				qty: String(line.qty ?? ""),
				rate: paiseToRupeeText(line.ratePaise ?? 0),
				gst: String(line.gstBp / 100),
			}));
	}
	return source.catalog.map(catalogRow);
}

function initialCharges(existing?: SinvDetail): ChargeRow[] {
	return (existing?.lines ?? [])
		.filter((line) => line.kind === "charge")
		.map((line) => ({
			key: `c${line.id}`,
			type: line.chargeType ?? "other",
			description: line.description ?? "",
			taxable: paiseToRupeeText(line.taxablePaise),
			gst: String(line.gstBp / 100),
		}));
}

function initialPrinted(existing?: SinvDetail): PrintedText {
	const p = existing?.printed;
	const text = (paise: number | undefined) =>
		paise === undefined ? "" : paiseToRupeeText(paise);
	return {
		taxable: text(p?.taxablePaise),
		cgst: p && p.cgstPaise > 0 ? text(p.cgstPaise) : "",
		sgst: p && p.sgstPaise > 0 ? text(p.sgstPaise) : "",
		igst: p && p.igstPaise > 0 ? text(p.igstPaise) : "",
		total: text(p?.totalPaise),
	};
}

type Banner = {
	message: string;
	link?: { href: string; label: string };
};

export function InvoiceForm({
	source,
	existing,
	grnId,
	plantStateCode,
	priceTolerancePercent,
	weightTolerancePercent,
}: {
	source: InvoiceFormSource;
	existing?: SinvDetail;
	grnId?: number;
	plantStateCode: string | null;
	priceTolerancePercent: number;
	weightTolerancePercent: number;
}) {
	const router = useRouter();
	const create = useCreateSupplierInvoiceMutation();
	const update = useUpdateSupplierInvoiceMutation();
	const submit = useSubmitSupplierInvoiceMutation();
	const [working, setWorking] = useState<"draft" | "submit" | null>(null);
	const isPending =
		working !== null ||
		create.isPending ||
		update.isPending ||
		submit.isPending;

	const [invoiceNumber, setInvoiceNumber] = useState(
		existing?.invoiceNumber ?? "",
	);
	const [invoiceDate, setInvoiceDate] = useState(existing?.invoiceDate ?? "");
	const [reverseCharge, setReverseCharge] = useState(
		existing?.reverseCharge ?? false,
	);
	const [itcNotEligible, setItcNotEligible] = useState(
		existing?.itcIneligible ?? false,
	);
	const [items, setItems] = useState<ItemRow[]>(() =>
		initialItems(source, existing),
	);
	const [charges, setCharges] = useState<ChargeRow[]>(() =>
		initialCharges(existing),
	);
	const [printed, setPrinted] = useState<PrintedText>(() =>
		initialPrinted(existing),
	);
	const [savedId, setSavedId] = useState<number | undefined>(existing?.id);
	const [dirty, setDirty] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [numberError, setNumberError] = useState<string | null>(null);
	const [leaveOpen, setLeaveOpen] = useState(false);

	const today = useMemo(() => todayIst(), []);
	const catalogById = useMemo(
		() => new Map(source.catalog.map((line) => [line.grnItemId, line])),
		[source.catalog],
	);
	const priceTolBp = percentToBp(priceTolerancePercent);
	const weightTolBp = percentToBp(weightTolerancePercent);
	const taxType = guessTaxType(source.supplier.gstin, plantStateCode);

	const normalizedNumber = invoiceNumber.trim().toUpperCase();
	const numberFormatError = SINV_INVOICE_NUMBER_PATTERN.test(normalizedNumber)
		? null
		: "Use 1 to 16 characters: letters A to Z, digits, - and /";
	const dateError =
		invoiceDate === ""
			? "Invoice date is required"
			: invoiceDate > today
				? "Invoice date can't be after today"
				: null;
	const dueDate = invoiceDate
		? addDays(invoiceDate, source.paymentTermsDays)
		: null;

	// Live numbers from the rows that parse; the server result at save is final.
	const live = useMemo(() => {
		const calcLines: { qty: number; ratePaise: number; gstBp: number }[] = [];
		let lineChecks = 0;
		for (const row of items) {
			const line = catalogById.get(row.grnItemId);
			if (!line) continue;
			const qty = parseQty(row.qty, line.uom);
			const rate = rupeesToPaise(row.rate);
			if (qty === null || rate === null || rate < 1 || row.gst === "") continue;
			const gstBp = gstPercentToBp(Number(row.gst));
			calcLines.push({ qty, ratePaise: rate, gstBp });
			lineChecks += matchLine(
				{
					uom: line.uom,
					qty,
					ratePaise: rate,
					gstBp,
					billableQty: line.billableQty,
					poRatePaise: line.poRatePaise,
					poGstBp: gstPercentToBp(line.poGstPercent),
				},
				priceTolBp,
				weightTolBp,
			).checks.length;
		}
		const calcCharges: { taxablePaise: number; gstBp: number }[] = [];
		for (const charge of charges) {
			const taxable = rupeesToPaise(charge.taxable);
			if (taxable === null || taxable < 1 || charge.gst === "") continue;
			calcCharges.push({
				taxablePaise: taxable,
				gstBp: gstPercentToBp(Number(charge.gst)),
			});
		}
		return {
			totals: computeTotals(calcLines, calcCharges, taxType),
			lineChecks,
			chargeChecks: charges.length,
		};
	}, [items, charges, catalogById, priceTolBp, weightTolBp, taxType]);

	const expectedChecks =
		live.lineChecks +
		live.chargeChecks +
		printedOverTolerance(live.totals, taxType, printed).size;

	const itemsInvalid =
		items.length === 0 ||
		items.some((row) => {
			const line = catalogById.get(row.grnItemId);
			return !line || Object.keys(itemRowErrors(row, line)).length > 0;
		});
	const chargesInvalid = charges.some(
		(row) => Object.keys(chargeRowErrors(row)).length > 0,
	);
	const printedPaise = {
		taxable: rupeesToPaise(printed.taxable),
		total: rupeesToPaise(printed.total),
		cgst: printed.cgst.trim() === "" ? 0 : rupeesToPaise(printed.cgst),
		sgst: printed.sgst.trim() === "" ? 0 : rupeesToPaise(printed.sgst),
		igst: printed.igst.trim() === "" ? 0 : rupeesToPaise(printed.igst),
	};
	const printedInvalid = Object.values(printedPaise).some((v) => v === null);

	const detailHref = existing ? `/supplier-invoices/${existing.id}` : null;
	const cancelHref =
		detailHref ?? (grnId ? `/grn/${grnId}` : "/supplier-invoices");

	function touch<T>(setter: (value: T) => void) {
		return (value: T) => {
			setter(value);
			setDirty(true);
			setNumberError(null);
		};
	}

	function buildPayload() {
		const lines: SinvLineInput[] = items.map((row) => {
			const line = catalogById.get(row.grnItemId);
			return {
				grnItemId: row.grnItemId,
				qty: parseQty(row.qty, line?.uom ?? null) as number,
				ratePaise: rupeesToPaise(row.rate) as number,
				gstPercent: Number(row.gst),
			};
		});
		const chargeInputs: SinvChargeInput[] = charges.map((row) => ({
			type: row.type,
			description: row.description.trim() || undefined,
			taxablePaise: rupeesToPaise(row.taxable) as number,
			gstPercent: Number(row.gst),
		}));
		return {
			invoiceNumber: normalizedNumber,
			invoiceDate,
			reverseCharge,
			itcNotEligible,
			printed: {
				taxablePaise: printedPaise.taxable as number,
				cgstPaise: printedPaise.cgst as number,
				sgstPaise: printedPaise.sgst as number,
				igstPaise: printedPaise.igst as number,
				totalPaise: printedPaise.total as number,
			},
			lines,
			charges: chargeInputs,
		};
	}

	function showError(error: unknown, fallback: string) {
		if (
			error instanceof ApiClientError &&
			error.code === "SINV_DUPLICATE_NUMBER"
		) {
			setNumberError(
				error.message || "This supplier already has a bill with this number",
			);
			return;
		}
		const code = error instanceof ApiClientError ? error.code : undefined;
		const next: Banner = { message: sinvErrorMessage(error, fallback) };
		if (code === "SINV_COMPANY_SETTINGS_MISSING") {
			next.link = { href: "/subcontracting/settings", label: "Open settings" };
		}
		if (code === "SINV_PO_NOT_BILLABLE" || code === "SINV_NOTHING_TO_BILL") {
			next.link = grnId
				? { href: `/grn/${grnId}`, label: "Back to the GRN" }
				: {
						href: source.prId
							? `/purchase-orders/${source.prId}`
							: "/purchase-orders/tracking",
						label: "Back to purchase orders",
					};
		}
		setBanner(next);
	}

	async function onSave(andSubmit: boolean) {
		setShowErrors(true);
		setBanner(null);
		setNumberError(null);
		if (
			numberFormatError ||
			dateError ||
			itemsInvalid ||
			chargesInvalid ||
			printedInvalid ||
			charges.length > SINV_MAX_CHARGES
		) {
			return;
		}
		setWorking(andSubmit ? "submit" : "draft");
		let id = savedId;
		try {
			const payload = buildPayload();
			if (id === undefined) {
				const created = await create.mutateAsync({
					poId: source.poId,
					...payload,
				});
				id = created.data.id;
			} else {
				await update.mutateAsync({ id, ...payload });
			}
			setSavedId(id);
			setDirty(false);
		} catch (error) {
			showError(error, "Could not save the invoice.");
			setWorking(null);
			return;
		}
		if (andSubmit) {
			try {
				await submit.mutateAsync(id);
			} catch (error) {
				// The draft is saved; the next Save or Submit updates it.
				showError(error, "Saved as a draft, but could not submit it.");
				setWorking(null);
				return;
			}
		}
		router.push(`/supplier-invoices/${id}`);
	}

	// Enter inside a field must not submit the bill; only the Submit button does.
	function onFormSubmit(event: FormEvent) {
		event.preventDefault();
	}

	function onCancel() {
		if (dirty) setLeaveOpen(true);
		else router.push(cancelHref);
	}

	return (
		<form onSubmit={onFormSubmit} className="flex w-full flex-col gap-4">
			<PageHeader
				title={
					existing ? `Edit ${existing.ourNumber}` : "Enter supplier invoice"
				}
				description={`Against ${source.poNumber}. Check the match before you submit.`}
			/>

			{banner ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					<span>{banner.message}</span>
					{banner.link ? (
						<Link href={banner.link.href} className="font-medium underline">
							{banner.link.label}
						</Link>
					) : null}
				</div>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Invoice details</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-x-4 gap-y-2 md:grid-cols-3">
					<Field id="sinv-supplier" label="Supplier">
						<p id="sinv-supplier" className="flex h-9 items-center text-sm">
							{source.supplier.name}
						</p>
					</Field>
					<Field id="sinv-po" label="PO no.">
						<p id="sinv-po" className="flex h-9 items-center font-mono text-sm">
							{source.poNumber}
						</p>
					</Field>
					<Field
						id="sinv-due"
						label="Due date"
						hint="Set by the PO payment terms"
					>
						<p
							id="sinv-due"
							className="flex h-9 items-center text-sm tabular-nums"
						>
							{dueDate ? formatDate(dueDate) : "–"}
						</p>
					</Field>
					<Field
						id="sinv-number"
						label="Supplier invoice no. *"
						error={numberError ?? (showErrors ? numberFormatError : null)}
					>
						<Input
							id="sinv-number"
							value={invoiceNumber}
							maxLength={40}
							disabled={isPending}
							aria-invalid={
								numberError || (showErrors && numberFormatError)
									? true
									: undefined
							}
							className="font-mono"
							onChange={(event) => touch(setInvoiceNumber)(event.target.value)}
							onBlur={() =>
								setInvoiceNumber((value) => value.trim().toUpperCase())
							}
						/>
					</Field>
					<Field
						id="sinv-date"
						label="Invoice date *"
						error={showErrors ? dateError : null}
					>
						<Input
							id="sinv-date"
							type="date"
							value={invoiceDate}
							max={today}
							disabled={isPending}
							aria-invalid={showErrors && dateError ? true : undefined}
							onChange={(event) => touch(setInvoiceDate)(event.target.value)}
						/>
					</Field>
					<div className="flex flex-col justify-center gap-2 pb-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="sinv-rcm"
								checked={reverseCharge}
								disabled={isPending}
								onCheckedChange={(checked) =>
									touch(setReverseCharge)(checked === true)
								}
							/>
							<Label htmlFor="sinv-rcm">Reverse charge</Label>
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								id="sinv-itc"
								checked={itcNotEligible}
								disabled={isPending}
								onCheckedChange={(checked) =>
									touch(setItcNotEligible)(checked === true)
								}
							/>
							<Label htmlFor="sinv-itc">ITC not eligible</Label>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 min-[1536px]:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
				<div className="flex min-w-0 flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Items</CardTitle>
						</CardHeader>
						<CardContent>
							<InvoiceLinesEditor
								catalog={source.catalog}
								rows={items}
								priceTolBp={priceTolBp}
								weightTolBp={weightTolBp}
								showErrors={showErrors}
								disabled={isPending}
								onChange={(grnItemId, patch) => {
									setItems((current) =>
										current.map((row) =>
											row.grnItemId === grnItemId ? { ...row, ...patch } : row,
										),
									);
									setDirty(true);
								}}
								onRemove={(grnItemId) => {
									setItems((current) =>
										current.filter((row) => row.grnItemId !== grnItemId),
									);
									setDirty(true);
								}}
								onAdd={(line) => {
									setItems((current) => [...current, catalogRow(line)]);
									setDirty(true);
								}}
							/>
							{showErrors && items.length === 0 ? (
								<p className="mt-2 text-[13px] text-destructive">
									Add at least one item line.
								</p>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>
								Charges ({charges.length}/{SINV_MAX_CHARGES})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<InvoiceChargesEditor
								rows={charges}
								showErrors={showErrors}
								disabled={isPending}
								onChange={(key, patch) => {
									setCharges((current) =>
										current.map((row) =>
											row.key === key ? { ...row, ...patch } : row,
										),
									);
									setDirty(true);
								}}
								onRemove={(key) => {
									setCharges((current) =>
										current.filter((row) => row.key !== key),
									);
									setDirty(true);
								}}
								onAdd={() => {
									setCharges((current) => [
										...current,
										{
											key: `n${Date.now()}-${current.length}`,
											type: "freight",
											description: "",
											taxable: "",
											gst: "18",
										},
									]);
									setDirty(true);
								}}
							/>
						</CardContent>
					</Card>
				</div>

				<InvoiceTotalsPanel
					totals={live.totals}
					taxType={taxType}
					printed={printed}
					disabled={isPending}
					showErrors={showErrors}
					expectedChecks={expectedChecks}
					onPrintedChange={(head, value) => {
						setPrinted((current) => ({ ...current, [head]: value }));
						setDirty(true);
					}}
				/>
			</div>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={isPending}
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="secondary"
					disabled={isPending}
					onClick={() => void onSave(false)}
				>
					{working === "draft" ? "Saving…" : "Save draft"}
				</Button>
				<Button
					type="button"
					disabled={isPending}
					onClick={() => void onSave(true)}
				>
					{working === "submit" ? "Submitting…" : "Submit"}
				</Button>
			</div>

			<AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Leave without saving?</AlertDialogTitle>
						<AlertDialogDescription>
							Your changes on this invoice are not saved yet.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction onClick={() => router.push(cancelHref)}>
							Leave
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</form>
	);
}
