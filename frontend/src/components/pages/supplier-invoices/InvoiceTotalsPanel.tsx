"use client";

import type { PrintedText } from "@/components/pages/supplier-invoices/invoice-form-types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import {
	overTolerance,
	rupeesToPaise,
	type Totals,
} from "@/lib/supplier-invoice-calc";
import type { SinvTaxType } from "@/types/supplier-invoice";

type Head = "taxable" | "cgst" | "sgst" | "igst" | "total";

const HEADS: { key: Head; label: string }[] = [
	{ key: "taxable", label: "Taxable" },
	{ key: "cgst", label: "CGST" },
	{ key: "sgst", label: "SGST" },
	{ key: "igst", label: "IGST" },
	{ key: "total", label: "Total" },
];

const TAX_TYPE_NOTE: Record<SinvTaxType, string> = {
	cgst_sgst: "Same state: CGST + SGST",
	igst: "Other state: IGST",
	none: "Supplier has no GSTIN: no GST expected",
};

function isUsed(head: Head, taxType: SinvTaxType | null): boolean {
	if (head === "taxable" || head === "total") return true;
	if (taxType === null) return false;
	if (taxType === "cgst_sgst") return head === "cgst" || head === "sgst";
	if (taxType === "igst") return head === "igst";
	return false;
}

/** Which printed rows are over the ₹1.00 tolerance (BR-SINV-19, 20). Empty when the type is unknown for tax heads. */
export function printedOverTolerance(
	totals: Totals,
	taxType: SinvTaxType | null,
	printed: PrintedText,
): Set<"cgst" | "sgst" | "igst" | "total"> {
	const out = new Set<"cgst" | "sgst" | "igst" | "total">();
	const read = (text: string) => (text.trim() === "" ? 0 : rupeesToPaise(text));
	const total = rupeesToPaise(printed.total);
	if (total !== null && overTolerance(totals.total, total)) out.add("total");
	if (taxType === null) return out;
	for (const head of ["cgst", "sgst", "igst"] as const) {
		const value = read(printed[head]);
		if (value !== null && overTolerance(totals[head], value)) out.add(head);
	}
	return out;
}

export function InvoiceTotalsPanel({
	totals,
	taxType,
	printed,
	disabled,
	showErrors,
	expectedChecks,
	onPrintedChange,
}: {
	totals: Totals;
	taxType: SinvTaxType | null;
	printed: PrintedText;
	disabled: boolean;
	showErrors: boolean;
	/** Number of checks that would fail now (0 = payable). */
	expectedChecks: number;
	onPrintedChange: (head: Head, value: string) => void;
}) {
	const over = printedOverTolerance(totals, taxType, printed);
	return (
		<Card className="min-[1280px]:sticky min-[1280px]:top-4">
			<CardHeader>
				<CardTitle>Totals</CardTitle>
				<p className="text-[13px] text-muted-foreground">
					{taxType
						? TAX_TYPE_NOTE[taxType]
						: "The tax split is worked out when you save."}
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="grid grid-cols-[4.5rem_1fr_9rem_1fr] items-center gap-x-2 gap-y-2 text-sm">
					<span />
					<span className="text-right text-[13px] font-medium text-muted-foreground">
						Computed
					</span>
					<span className="text-right text-[13px] font-medium text-muted-foreground">
						Printed on bill
					</span>
					<span className="text-right text-[13px] font-medium text-muted-foreground">
						Difference
					</span>
					{HEADS.map(({ key, label }) => {
						const used = isUsed(key, taxType);
						const taxHead = key === "cgst" || key === "sgst" || key === "igst";
						const computed =
							key === "taxable"
								? totals.taxable
								: key === "total"
									? totals.total
									: totals[key];
						const text = printed[key];
						const value =
							text.trim() === "" && taxHead ? 0 : rupeesToPaise(text);
						const required = key === "taxable" || key === "total";
						const invalid =
							text.trim() !== "" && value === null
								? true
								: showErrors && required && text.trim() === "";
						const diff =
							value !== null && (taxType !== null || !taxHead)
								? value - computed
								: null;
						const flagged = key === "total" || taxHead ? over.has(key) : false;
						const id = `sinv-printed-${key}`;
						return (
							<div key={key} className="contents">
								<Label htmlFor={id} className="font-medium">
									{label}
									{required ? " *" : ""}
								</Label>
								<span
									className={`text-right tabular-nums ${used ? "" : "text-muted-foreground"}`}
								>
									{taxHead && taxType === null
										? "–"
										: used
											? formatMoney(computed)
											: "not used"}
								</span>
								<Input
									id={id}
									inputMode="decimal"
									value={text}
									placeholder={taxHead ? "0.00" : undefined}
									disabled={disabled}
									aria-invalid={invalid ? true : undefined}
									className="text-right tabular-nums"
									onChange={(event) => onPrintedChange(key, event.target.value)}
								/>
								<span
									className={`flex items-center justify-end gap-1 tabular-nums ${flagged ? "text-destructive" : ""}`}
								>
									{diff === null ? "–" : formatMoney(diff)}
									{flagged ? (
										<StatusBadge
											doc="supplierInvoiceMatch"
											status={key === "total" ? "total" : "tax"}
										/>
									) : null}
								</span>
							</div>
						);
					})}
				</div>
				<output
					className={`block rounded-md px-3 py-2 text-sm ${
						expectedChecks === 0
							? "bg-success-subtle text-success"
							: "bg-warning-subtle text-warning"
					}`}
				>
					{expectedChecks === 0
						? "Expected result: Payable"
						: `Expected result: Blocked, ${expectedChecks} ${expectedChecks === 1 ? "check fails" : "checks fail"}`}
				</output>
			</CardContent>
		</Card>
	);
}
