import type { ReactNode } from "react";

import {
	groupEway,
	MODE_LABEL,
} from "@/components/pages/delivery-notes/dn-format";
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
import { type DnDetail, dnQtyDecimals } from "@/types/delivery-note";

/** Always-light A4 paper: the sheet re-declares the light tokens, so dark mode never reaches it. */
function Paper({ children }: { children: ReactNode }) {
	return (
		<div className="print-sheet-light dn-print-sheet relative mx-auto [&_table]:text-[13px] [&_td]:px-2 [&_th]:px-2 w-full max-w-4xl space-y-5 overflow-hidden rounded-md border bg-background p-6 text-sm text-foreground print:max-w-none print:overflow-visible print:border-0 print:p-0">
			{children}
		</div>
	);
}

function Watermark({ text }: { text: string }) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			<span className="-rotate-12 text-7xl font-bold tracking-widest text-destructive opacity-15">
				{text}
			</span>
		</div>
	);
}

/** In the page flow under the title, so it never runs across the item table (DES-59). */
function CancelledMark() {
	return (
		<div aria-hidden="true" className="flex justify-center">
			<span className="-rotate-3 rounded-md border-2 border-destructive px-3 py-1 text-xl font-bold tracking-widest text-destructive opacity-60">
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

/** Delivery challan (BR-DSP-41). Price, tax and totals are left out of the HTML without `so.view`. */
export function DnPrintSheet({ note }: { note: DnDetail }) {
	const showMoney = note.valuePaise !== undefined;
	const company = note.company;
	const t = note.transport;
	const skuOf = (soLineId: number) =>
		note.lines.find((line) => line.soLineId === soLineId)?.item.sku ?? "–";
	const draft = note.status === "draft";
	const cancelled = note.status === "cancelled";
	const sameShipTo =
		note.shipTo.address === note.customer.address &&
		note.shipTo.stateCode === note.customer.stateCode;
	return (
		<Paper>
			{draft ? <Watermark text="DRAFT" /> : null}
			<p className="text-center text-base font-semibold tracking-wide">
				DELIVERY NOTE — NOT A TAX INVOICE
			</p>
			{cancelled ? <CancelledMark /> : null}
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-0.5">
					<p className="font-medium">{company?.name ?? "–"}</p>
					<p>{company?.address ?? "–"}</p>
					<p>
						GSTIN: {company?.gstin ?? "–"} · State {company?.stateCode ?? "–"}
					</p>
				</div>
				<Facts
					items={[
						[
							"Note no.",
							<span key="no" className="font-mono">
								{note.dnNumber ?? "Draft"}
							</span>,
						],
						["Date", formatDate(note.noteDate)],
						[
							"SO no.",
							<span key="so" className="font-mono">
								{note.soNumber}
							</span>,
						],
						["Customer PO", note.customerPoNumber ?? "–"],
					]}
				/>
			</div>

			{cancelled ? (
				<p className="font-medium text-destructive">
					Cancelled{note.cancelReason ? `: ${note.cancelReason}` : ""}
				</p>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
				<div className="space-y-0.5">
					<p className="font-medium text-muted-foreground">To</p>
					<p className="font-medium">{note.customer.name}</p>
					<p>{note.customer.address}</p>
					<p>GSTIN: {note.customer.gstin ?? "unregistered"}</p>
				</div>
				<div className="space-y-0.5">
					<p className="font-medium text-muted-foreground">Ship-to</p>
					<p>
						{sameShipTo
							? "Same as customer"
							: `${note.shipTo.address} (state ${note.shipTo.stateCode})`}
					</p>
					<p className="text-muted-foreground">
						From {note.sourceLocation.name}
					</p>
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>#</TableHead>
						<TableHead>Item</TableHead>
						<TableHead>HSN</TableHead>
						<TableHead className="text-right">Qty</TableHead>
						<TableHead>Unit</TableHead>
						<TableHead>Lot</TableHead>
						{showMoney ? (
							<>
								<TableHead className="text-right">Price</TableHead>
								<TableHead className="text-right">Taxable</TableHead>
								<TableHead className="text-right">GST %</TableHead>
								<TableHead className="text-right">GST</TableHead>
							</>
						) : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{note.lines.map((line, index) => (
						<TableRow key={line.id}>
							<TableCell>{index + 1}</TableCell>
							<TableCell className="whitespace-normal">
								{line.item.sku} · {line.item.name}
							</TableCell>
							<TableCell>{line.item.hsnCode ?? "–"}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(line.qty, null, dnQtyDecimals(line.uom))}
							</TableCell>
							<TableCell>{line.uom}</TableCell>
							<TableCell>{line.lotNo ?? "–"}</TableCell>
							{showMoney ? (
								<>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.unitPricePaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.taxablePaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{line.gstPercent}%
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(line.gstPaise)}
									</TableCell>
								</>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>

			{showMoney ? (
				<dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-right">
					<dt className="text-muted-foreground">Taxable</dt>
					<dd className="tabular-nums">{formatMoney(note.taxablePaise)}</dd>
					<dt className="text-muted-foreground">GST</dt>
					<dd className="tabular-nums">{formatMoney(note.gstPaise)}</dd>
					<dt className="font-semibold">Total</dt>
					<dd className="font-semibold tabular-nums">
						{formatMoney(note.valuePaise)}
					</dd>
				</dl>
			) : null}

			{note.remarks ? (
				<p>
					<span className="font-medium">Remarks: </span>
					{note.remarks}
				</p>
			) : null}

			{note.packages.length > 0 ? (
				<div className="space-y-1">
					<p className="font-medium">Packages</p>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Package no.</TableHead>
								<TableHead>Item</TableHead>
								<TableHead className="text-right">Qty</TableHead>
								<TableHead className="text-right">Net kg</TableHead>
								<TableHead className="text-right">Gross kg</TableHead>
								<TableHead>Lot</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{note.packages.map((pkg) => (
								<TableRow key={pkg.id}>
									<TableCell className="font-mono">{pkg.packageNo}</TableCell>
									<TableCell>{skuOf(pkg.soLineId)}</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(pkg.qty, null, 3)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(pkg.netKg, null, 3)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQty(pkg.grossKg, null, 3)}
									</TableCell>
									<TableCell>{pkg.lotNo ?? "–"}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}

			<div className="space-y-0.5">
				<p className="font-medium">Transport and e-way bill</p>
				<p>
					Mode {t.mode ? MODE_LABEL[t.mode] : "–"}
					{t.mode === "road"
						? [
								t.vehicleNo ? ` · Vehicle ${t.vehicleNo}` : "",
								t.transporterId ? ` · Transporter ID ${t.transporterId}` : "",
							].join("")
						: [
								t.transportDocNo ? ` · Doc ${t.transportDocNo}` : "",
								t.transportDocDate
									? ` (${formatDate(t.transportDocDate)})`
									: "",
							].join("")}
					{t.transporterName ? ` · ${t.transporterName}` : ""}
				</p>
				{t.distanceKm !== null || t.ewayBillNo ? (
					<p>
						{t.distanceKm === null ? "" : `Distance ${t.distanceKm} km`}
						{t.distanceKm !== null && t.ewayBillNo ? " · " : ""}
						{t.ewayBillNo
							? `E-way bill ${groupEway(t.ewayBillNo)}${t.ewayBillDate ? ` (${formatDate(t.ewayBillDate)})` : ""} · Valid until ${formatDateTime(note.ewayValidUntil)}`
							: ""}
					</p>
				) : null}
			</div>

			<div className="grid grid-cols-2 gap-6 pt-10 text-center text-[13px] text-muted-foreground">
				{["Prepared by", "Received by"].map((label) => (
					<div key={label} className="border-t border-border pt-1">
						{label}
					</div>
				))}
			</div>
		</Paper>
	);
}
