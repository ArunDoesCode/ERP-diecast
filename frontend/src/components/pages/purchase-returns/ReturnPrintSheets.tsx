import type { ReactNode } from "react";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import type { PrtDebitNote, PrtDetail } from "@/types/purchase-return";

/** Always-light paper: the sheet re-declares the light tokens, so dark mode never reaches it. */
function Paper({ children }: { children: ReactNode }) {
	return (
		<div className="print-sheet-light relative mx-auto w-full max-w-4xl space-y-5 rounded-md border bg-background p-6 text-sm text-foreground print:max-w-none print:border-0 print:p-0">
			{children}
		</div>
	);
}

function Party({
	title,
	name,
	address,
	gstin,
}: {
	title: string;
	name: string;
	address: string | null;
	gstin: string | null;
}) {
	return (
		<div className="space-y-0.5">
			<p className="font-medium text-muted-foreground">{title}</p>
			<p className="font-medium">{name}</p>
			<p>{address ?? "–"}</p>
			<p>GSTIN: {gstin ?? "unregistered"}</p>
		</div>
	);
}

function CancelledMark() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			<span className="-rotate-12 rounded-md border-4 border-destructive px-6 py-2 text-5xl font-bold tracking-widest text-destructive opacity-40">
				CANCELLED
			</span>
		</div>
	);
}

function Facts({ items }: { items: [string, ReactNode][] }) {
	return (
		<dl className="space-y-0.5 text-right">
			{items.map(([label, value]) => (
				<div key={label} className="flex justify-end gap-2">
					<dt className="text-muted-foreground">{label}</dt>
					<dd className="font-medium">{value}</dd>
				</div>
			))}
		</dl>
	);
}

export function DebitNoteSheet({
	prt,
	note,
}: {
	prt: PrtDetail;
	note: PrtDebitNote;
}) {
	const cancelled = note.status === "cancelled";
	return (
		<Paper>
			{cancelled ? <CancelledMark /> : null}
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-0.5">
					<p className="font-medium">{note.plantName}</p>
					<p>{note.plantAddress ?? "–"}</p>
					<p>GSTIN: {note.plantGstin ?? "–"}</p>
				</div>
				<div className="space-y-1">
					<p className="text-right text-base font-semibold tracking-wide">
						DEBIT NOTE
					</p>
					<Facts
						items={[
							[
								"Debit note no.",
								<span key="dn" className="font-mono">
									{note.dnNumber}
								</span>,
							],
							[
								"Challan no.",
								<span key="ch" className="font-mono">
									{prt.challanNumber ?? "–"}
								</span>,
							],
							["Date", formatDate(note.debitNoteDate)],
							[
								"Return no.",
								<span key="rt" className="font-mono">
									{prt.proNumber}
								</span>,
							],
							[
								"PO no.",
								<span key="po" className="font-mono">
									{prt.poNumber}
								</span>,
							],
						]}
					/>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Party
					title="To (supplier)"
					name={note.supplierName}
					address={note.supplierAddress}
					gstin={note.supplierGstin}
				/>
				<div className="space-y-0.5">
					<p className="font-medium text-muted-foreground">Against</p>
					<p>
						GRN <span className="font-mono">{prt.grnNumber}</span>
						{prt.grnChallanNo ? ` · Supplier challan ${prt.grnChallanNo}` : ""}
					</p>
					<p>
						{note.supplierBill
							? `Bill ${note.supplierBill.invoiceNumber} (${formatDate(note.supplierBill.invoiceDate)})`
							: "No supplier bill linked"}
					</p>
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>#</TableHead>
						<TableHead>Item</TableHead>
						<TableHead>HSN</TableHead>
						<TableHead>Heat no.</TableHead>
						<TableHead className="text-right">Qty</TableHead>
						<TableHead className="text-right">Rate</TableHead>
						<TableHead className="text-right">Taxable</TableHead>
						<TableHead className="text-right">GST %</TableHead>
						{note.isInterstate ? (
							<TableHead className="text-right">IGST</TableHead>
						) : (
							<>
								<TableHead className="text-right">CGST</TableHead>
								<TableHead className="text-right">SGST</TableHead>
							</>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{prt.lines.map((line, index) => (
						<TableRow key={line.id}>
							<TableCell>{index + 1}</TableCell>
							<TableCell className="whitespace-normal">
								{line.itemName}
							</TableCell>
							<TableCell>{line.hsnCode ?? "–"}</TableCell>
							<TableCell>{line.batchNumber ?? "–"}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(line.qty, line.uom, 3)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMoney(line.ratePaise)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMoney(line.taxablePaise)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{line.gstPercent}%
							</TableCell>
							{note.isInterstate ? (
								<TableCell className="text-right tabular-nums">
									{formatMoney(line.igstPaise ?? line.gstPaise)}
								</TableCell>
							) : (
								<>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.cgstPaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.sgstPaise)}
									</TableCell>
								</>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>

			<dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-right">
				<dt className="text-muted-foreground">Taxable</dt>
				<dd className="tabular-nums">{formatMoney(note.taxablePaise)}</dd>
				{note.isInterstate ? (
					<>
						<dt className="text-muted-foreground">IGST</dt>
						<dd className="tabular-nums">{formatMoney(note.igstPaise)}</dd>
					</>
				) : (
					<>
						<dt className="text-muted-foreground">CGST</dt>
						<dd className="tabular-nums">{formatMoney(note.cgstPaise)}</dd>
						<dt className="text-muted-foreground">SGST</dt>
						<dd className="tabular-nums">{formatMoney(note.sgstPaise)}</dd>
					</>
				)}
				<dt className="font-semibold">Total</dt>
				<dd className="font-semibold tabular-nums">
					{formatMoney(note.totalPaise)}
				</dd>
			</dl>

			<p>
				<span className="font-medium">Reason: </span>
				{prt.reason}
			</p>
		</Paper>
	);
}

export function ReturnChallanSheet({
	prt,
	note,
}: {
	prt: PrtDetail;
	note: PrtDebitNote;
}) {
	return (
		<Paper>
			{prt.status === "cancelled" ? <CancelledMark /> : null}
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-0.5">
					<p className="text-base font-semibold tracking-wide">
						RETURN CHALLAN
					</p>
					<p>Goods returned to supplier</p>
				</div>
				<Facts
					items={[
						[
							"Challan no.",
							<span key="ch" className="font-mono">
								{prt.challanNumber ?? "–"}
							</span>,
						],
						[
							"Return no.",
							<span key="rt" className="font-mono">
								{prt.proNumber}
							</span>,
						],
						["Date", formatDate(prt.postedAt ?? note.debitNoteDate)],
						["Vehicle no.", prt.vehicleNo || "–"],
					]}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Party
					title="From (plant)"
					name={note.plantName}
					address={note.plantAddress}
					gstin={note.plantGstin}
				/>
				<Party
					title="To (supplier)"
					name={note.supplierName}
					address={note.supplierAddress}
					gstin={note.supplierGstin}
				/>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>#</TableHead>
						<TableHead>Item</TableHead>
						<TableHead>HSN</TableHead>
						<TableHead>Heat no.</TableHead>
						<TableHead className="text-right">Qty</TableHead>
						<TableHead>Unit</TableHead>
						<TableHead className="text-right">Value</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{prt.lines.map((line, index) => (
						<TableRow key={line.id}>
							<TableCell>{index + 1}</TableCell>
							<TableCell className="whitespace-normal">
								{line.itemName}
							</TableCell>
							<TableCell>{line.hsnCode ?? "–"}</TableCell>
							<TableCell>{line.batchNumber ?? "–"}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(line.qty, null, 3)}
							</TableCell>
							<TableCell>{line.uom}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMoney(line.taxablePaise + line.gstPaise)}
							</TableCell>
						</TableRow>
					))}
					<TableRow>
						<TableCell colSpan={6} className="text-right font-medium">
							Total
						</TableCell>
						<TableCell className="text-right font-medium tabular-nums">
							{formatMoney(note.totalPaise)}
						</TableCell>
					</TableRow>
				</TableBody>
			</Table>

			<div className="grid grid-cols-3 gap-6 pt-10 text-center text-[13px] text-muted-foreground">
				{["Prepared by", "Driver signature", "Supplier receipt"].map(
					(label) => (
						<div key={label} className="border-t border-border pt-1">
							{label}
						</div>
					),
				)}
			</div>
		</Paper>
	);
}
