import {
	bpText,
	describeMismatch,
	HISTORY_ACTION_LABEL,
} from "@/components/pages/supplier-invoices/invoice-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatQty,
} from "@/lib/format";
import { getStatusTone } from "@/lib/status-tone";
import {
	SINV_CHARGE_TYPE_LABEL,
	type SinvDetail,
	type SinvLine,
	type SinvMismatch,
	type SinvStatus,
} from "@/types/supplier-invoice";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right">{value}</dd>
		</div>
	);
}

function statusLabel(status: string) {
	return getStatusTone("supplierInvoice", status).label;
}

const MATCH_RAN: SinvStatus[] = ["blocked", "approved", "cancelled"];

export function MatchResultCard({ inv }: { inv: SinvDetail }) {
	if (inv.status === "draft" || inv.status === "legacy") return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Match result</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				{inv.mismatches.length === 0 ? (
					<p className="flex items-center gap-2">
						<StatusBadge doc="supplierInvoiceMatch" status="ok" />
						All checks passed.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{inv.mismatches.map((mismatch, index) => (
							<li
								key={`${mismatch.check}-${mismatch.lineId ?? "x"}-${mismatch.head ?? "x"}-${index}`}
								className="flex flex-wrap items-center gap-2"
							>
								<StatusBadge
									doc="supplierInvoiceMatch"
									status={mismatch.check}
								/>
								<span>{describeMismatch(mismatch, inv)}</span>
							</li>
						))}
					</ul>
				)}
				<p className="text-[13px] text-muted-foreground">
					Tolerance used: price {bpText(inv.tolerances.priceTolBpUsed)}, weight{" "}
					{bpText(inv.tolerances.weightTolBpUsed)}
				</p>
			</CardContent>
		</Card>
	);
}

function lineChecks(line: SinvLine, mismatches: SinvMismatch[]) {
	return mismatches
		.filter((mismatch) => mismatch.lineId === line.id)
		.map((mismatch) => mismatch.check);
}

export function InvoiceItemsCard({ inv }: { inv: SinvDetail }) {
	const items = inv.lines.filter((line) => line.kind === "item");
	const showMatch = MATCH_RAN.includes(inv.status);
	if (inv.status === "legacy") return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Items</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Billed qty</TableHead>
							<TableHead className="text-right">Rate</TableHead>
							<TableHead className="text-right">Taxable</TableHead>
							<TableHead className="text-right">Tax</TableHead>
							<TableHead className="text-right">Line total</TableHead>
							{showMatch ? <TableHead>Match</TableHead> : null}
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((line) => {
							const tax = line.cgstPaise + line.sgstPaise + line.igstPaise;
							const checks = lineChecks(line, inv.mismatches);
							return (
								<TableRow key={line.id}>
									<TableCell className="whitespace-normal">
										<span className="block">{line.itemName}</span>
										<span className="block font-mono text-[13px] text-muted-foreground">
											{line.grnNumber ?? "–"}
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(line.qty, line.uom, 3)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.ratePaise)}
										<span className="block text-[13px] text-muted-foreground">
											PO {formatMoney(line.poRatePaise)}
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.taxablePaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(tax)}
										<span className="block text-[13px] text-muted-foreground">
											{bpText(line.gstBp)}
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.taxablePaise + tax)}
									</TableCell>
									{showMatch ? (
										<TableCell className="whitespace-normal">
											<span className="flex flex-wrap gap-1">
												{checks.length === 0 ? (
													<StatusBadge doc="supplierInvoiceMatch" status="ok" />
												) : (
													checks.map((check) => (
														<StatusBadge
															key={check}
															doc="supplierInvoiceMatch"
															status={check}
														/>
													))
												)}
												{line.belowPoRate ? (
													<StatusBadge
														doc="supplierInvoiceMatch"
														status="below_po_rate"
													/>
												) : null}
											</span>
										</TableCell>
									) : null}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

export function InvoiceChargesCard({ inv }: { inv: SinvDetail }) {
	const charges = inv.lines.filter((line) => line.kind === "charge");
	if (charges.length === 0) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Charges</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Type</TableHead>
							<TableHead>Description</TableHead>
							<TableHead className="text-right">Taxable</TableHead>
							<TableHead className="text-right">GST %</TableHead>
							<TableHead className="text-right">Tax</TableHead>
							<TableHead className="text-right">Total</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{charges.map((line) => {
							const tax = line.cgstPaise + line.sgstPaise + line.igstPaise;
							return (
								<TableRow key={line.id}>
									<TableCell>
										{line.chargeType
											? SINV_CHARGE_TYPE_LABEL[line.chargeType]
											: "–"}
									</TableCell>
									<TableCell className="whitespace-normal">
										{line.description || "–"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.taxablePaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{bpText(line.gstBp)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(tax)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.taxablePaise + tax)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

export function LegacyCard({ inv }: { inv: SinvDetail }) {
	if (inv.status !== "legacy") return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Old record</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="mb-3 text-sm text-muted-foreground">
					Entered before bills were matched line by line. It has no lines and
					cannot be changed.
				</p>
				<dl className="space-y-1.5 text-sm">
					<Fact label="Supplier invoice no." value={inv.invoiceNumber} />
					<Fact label="Invoice date" value={formatDate(inv.invoiceDate)} />
					<Fact label="Amount" value={formatMoney(inv.billedAmountPaise)} />
				</dl>
			</CardContent>
		</Card>
	);
}

type HeadRow = { label: string; computed: number; printed: number };

export function InvoiceTotalsCard({ inv }: { inv: SinvDetail }) {
	if (inv.status === "legacy") return null;
	const rows: HeadRow[] = [
		{
			label: "Taxable",
			computed: inv.taxablePaise,
			printed: inv.printed.taxablePaise,
		},
	];
	const showCgstSgst = inv.taxType === "cgst_sgst" || inv.taxType === null;
	const showIgst = inv.taxType === "igst" || inv.taxType === null;
	if (showCgstSgst) {
		rows.push(
			{
				label: "CGST",
				computed: inv.cgstPaise,
				printed: inv.printed.cgstPaise,
			},
			{
				label: "SGST",
				computed: inv.sgstPaise,
				printed: inv.printed.sgstPaise,
			},
		);
	}
	if (showIgst) {
		rows.push({
			label: "IGST",
			computed: inv.igstPaise,
			printed: inv.printed.igstPaise,
		});
	}
	rows.push({
		label: "Total",
		computed: inv.totalPaise,
		printed: inv.printed.totalPaise,
	});
	const liveNotes = inv.debitNotes.filter(
		(note) => note.status !== "cancelled",
	);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Totals</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4 text-sm">
				<table className="w-full">
					<thead>
						<tr className="text-[13px] text-muted-foreground">
							<th scope="col" className="text-left font-medium">
								<span className="sr-only">Head</span>
							</th>
							<th scope="col" className="text-right font-medium">
								Computed
							</th>
							<th scope="col" className="text-right font-medium">
								Printed
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.label}>
								<th scope="row" className="py-0.5 text-left font-normal">
									{row.label}
								</th>
								<td className="py-0.5 text-right tabular-nums">
									{formatMoney(row.computed)}
								</td>
								<td className="py-0.5 text-right tabular-nums">
									{formatMoney(row.printed)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{inv.debitNotes.length > 0 ? (
					<div className="space-y-1.5 border-t pt-3">
						<p className="font-medium">Debit notes</p>
						<ul className="space-y-1.5">
							{inv.debitNotes.map((note) => (
								<li
									key={note.id}
									className="flex flex-wrap items-center justify-between gap-2"
								>
									<span className="flex items-center gap-2">
										<span className="font-mono">{note.number}</span>
										<StatusBadge doc="debitNote" status={note.status} />
									</span>
									{note.status === "cancelled" ? (
										<span className="text-muted-foreground tabular-nums">
											<span className="line-through">
												−{formatMoney(note.billOffsetPaise)}
											</span>{" "}
											<span className="text-[13px]">not counted</span>
										</span>
									) : (
										<span className="tabular-nums">
											−{formatMoney(note.billOffsetPaise)}
										</span>
									)}
								</li>
							))}
						</ul>
					</div>
				) : null}
				<div className="flex justify-between gap-3 border-t pt-3 font-bold">
					<span>Net payable</span>
					<span className="tabular-nums">
						{formatMoney(inv.netPayablePaise)}
					</span>
				</div>
				{liveNotes.length > 0 ? (
					<p className="text-[13px] text-muted-foreground">
						Bill total less the amount each debit note takes off this bill.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

export function InvoicePaymentCard({ inv }: { inv: SinvDetail }) {
	if (inv.status === "legacy") return null;
	const paymentLabel =
		inv.paymentStatus.charAt(0).toUpperCase() + inv.paymentStatus.slice(1);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Payment</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="space-y-1.5 text-sm">
					<Fact label="Due date" value={formatDate(inv.dueDate)} />
					<Fact label="Status" value={paymentLabel} />
					<Fact label="Payment terms" value={`${inv.paymentTermsDays} days`} />
					<Fact
						label="Reverse charge"
						value={inv.reverseCharge ? "Yes" : "No"}
					/>
					<Fact
						label="ITC not eligible"
						value={inv.itcIneligible ? "Yes" : "No"}
					/>
				</dl>
			</CardContent>
		</Card>
	);
}

/** Mismatches at release time from the history row detail, when the server stored them. */
function releasedMismatches(inv: SinvDetail): SinvMismatch[] {
	const row = inv.history.find((entry) => entry.action === "release");
	const detail = row?.detail;
	if (typeof detail !== "object" || detail === null) return [];
	const list = (detail as { mismatches?: unknown }).mismatches;
	return Array.isArray(list) ? (list as SinvMismatch[]) : [];
}

export function InvoiceReleaseCard({ inv }: { inv: SinvDetail }) {
	if (!inv.releasedAt) return null;
	const row = inv.history.find((entry) => entry.action === "release");
	const mismatches = releasedMismatches(inv);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Release</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				<dl className="space-y-1.5">
					<Fact
						label="Released by"
						value={row?.createdByName ?? `user ${inv.releasedBy}`}
					/>
					<Fact label="Released at" value={formatDateTime(inv.releasedAt)} />
					<Fact label="Reason" value={inv.releaseReason || "–"} />
				</dl>
				{mismatches.length > 0 ? (
					<ul className="list-disc space-y-1 pl-4 text-[13px]">
						{mismatches.map((mismatch, index) => (
							<li key={`${mismatch.check}-${mismatch.lineId ?? "x"}-${index}`}>
								{describeMismatch(mismatch, inv)}
							</li>
						))}
					</ul>
				) : null}
			</CardContent>
		</Card>
	);
}

export function InvoiceHistoryCard({ inv }: { inv: SinvDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>History</CardTitle>
			</CardHeader>
			<CardContent>
				{inv.history.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nothing yet.</p>
				) : (
					<ol className="space-y-3 border-l pl-3 text-sm">
						{inv.history.map((event) => (
							<li key={event.id} className="space-y-0.5">
								<p className="font-medium">
									{HISTORY_ACTION_LABEL[event.action] ?? event.action}
									<span className="font-normal text-muted-foreground">
										{" "}
										by {event.createdByName ?? `user ${event.createdBy}`}
									</span>
								</p>
								<p className="text-[13px] text-muted-foreground">
									{formatDateTime(event.createdAt)}
									{event.fromStatus && event.toStatus
										? ` · ${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`
										: ""}
								</p>
								{event.reason ? (
									<p className="text-[13px]">Reason: {event.reason}</p>
								) : null}
							</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}
