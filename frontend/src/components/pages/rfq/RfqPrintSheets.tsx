import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, formatQty } from "@/lib/format";
import type { PrintSheet, RfqPrint } from "@/types/rfq";

const BLANK = "________";

/** One request-for-quotation sheet for one supplier. Always light paper; no rates, notes or other suppliers (BR-RFQ-08). */
function Sheet({ print, sheet }: { print: RfqPrint; sheet: PrintSheet }) {
	const { company } = print;
	return (
		<section
			aria-label={`RFQ sheet for ${sheet.supplier.name}`}
			className="print-sheet-light mx-auto w-full max-w-4xl space-y-5 rounded-md border bg-background p-6 text-sm text-foreground print:max-w-none print:break-after-page print:border-0 print:p-0"
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-0.5">
					{company ? (
						<>
							<p className="text-base font-semibold">{company.name}</p>
							<p>{company.address ?? ""}</p>
							{company.gstin ? <p>GSTIN: {company.gstin}</p> : null}
						</>
					) : null}
				</div>
				<p className="text-lg font-bold tracking-wide">REQUEST FOR QUOTATION</p>
			</div>
			<div className="flex flex-wrap justify-between gap-4">
				<dl className="space-y-0.5">
					<div className="flex gap-2">
						<dt className="text-muted-foreground">RFQ no.</dt>
						<dd className="font-mono font-medium">{print.rfqNumber}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-muted-foreground">Quote due</dt>
						<dd className="font-medium">{formatDate(print.dueDate)}</dd>
					</div>
				</dl>
				<div className="space-y-0.5">
					<p className="text-muted-foreground">To</p>
					<p className="font-medium">{sheet.supplier.name}</p>
					<p>{sheet.supplier.address ?? ""}</p>
					{sheet.supplier.gstin ? <p>GSTIN: {sheet.supplier.gstin}</p> : null}
				</div>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Item</TableHead>
						<TableHead className="text-right">Qty</TableHead>
						<TableHead>Rate</TableHead>
						<TableHead>GST</TableHead>
						<TableHead>Lead</TableHead>
						<TableHead>Valid till</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sheet.lines.map((line) => (
						<TableRow key={`${line.itemCode}-${line.qty}`}>
							<TableCell>
								{line.itemCode} · {line.itemName}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(line.qty, line.uom, 3)}
							</TableCell>
							<TableCell>{BLANK}</TableCell>
							<TableCell>{BLANK}</TableCell>
							<TableCell>{BLANK}</TableCell>
							<TableCell>{BLANK}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</section>
	);
}

export function RfqPrintSheets({
	print,
	supplierId,
}: {
	print: RfqPrint;
	supplierId?: number;
}) {
	const sheets = supplierId
		? print.sheets.filter((sheet) => sheet.supplier.id === supplierId)
		: print.sheets;
	return (
		<div className="flex w-full flex-col gap-6">
			{sheets.map((sheet) => (
				<Sheet key={sheet.supplier.id} print={print} sheet={sheet} />
			))}
		</div>
	);
}
