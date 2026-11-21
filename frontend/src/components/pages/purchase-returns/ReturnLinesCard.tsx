import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatMoney, formatQty } from "@/lib/format";
import type { PrtDetail } from "@/types/purchase-return";

const SOURCE_LABEL = { rejected: "Rejected", accepted: "Accepted" } as const;

export function totalsOf(prt: PrtDetail) {
	const taxable = prt.lines.reduce((sum, line) => sum + line.taxablePaise, 0);
	const gst = prt.lines.reduce((sum, line) => sum + line.gstPaise, 0);
	const note = prt.debitNote;
	return {
		taxable: note?.taxablePaise ?? taxable,
		gst: note ? note.cgstPaise + note.sgstPaise + note.igstPaise : gst,
		total: note?.totalPaise ?? taxable + gst,
		note,
	};
}

export function ReturnLinesCard({ prt }: { prt: PrtDetail }) {
	const totals = totalsOf(prt);
	const note = totals.note;
	const isDraft = prt.status === "draft";
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lines</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Rate</TableHead>
							<TableHead className="text-right">Taxable</TableHead>
							<TableHead className="text-right">GST %</TableHead>
							<TableHead className="text-right">Value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{prt.lines.map((line) => (
							<TableRow key={line.id}>
								<TableCell className="whitespace-normal">
									<span className="block">{line.itemName}</span>
									<span className="block text-[13px] text-muted-foreground">
										{SOURCE_LABEL[line.source]}
										{line.batchNumber ? ` · Heat ${line.batchNumber}` : ""}
									</span>
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatQty(line.qty, line.uom, 3)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatMoney(line.ratePaise)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{isDraft ? "–" : formatMoney(line.taxablePaise)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{line.gstPercent}%
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{isDraft
										? "–"
										: formatMoney(line.taxablePaise + line.gstPaise)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>

				{isDraft ? (
					<dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-right text-sm">
						<dt className="font-medium">Total on post</dt>
						<dd className="font-medium tabular-nums">
							{prt.preview ? formatMoney(prt.preview.debitNoteTotalPaise) : "–"}
						</dd>
						<dd className="col-span-2 text-[13px] text-muted-foreground">
							Taxable value and GST are fixed when the return is posted.
						</dd>
					</dl>
				) : (
					<dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-right text-sm">
						<dt className="text-muted-foreground">Taxable</dt>
						<dd className="tabular-nums">{formatMoney(totals.taxable)}</dd>
						{note ? (
							note.isInterstate ? (
								<>
									<dt className="text-muted-foreground">IGST</dt>
									<dd className="tabular-nums">
										{formatMoney(note.igstPaise)}
									</dd>
								</>
							) : (
								<>
									<dt className="text-muted-foreground">CGST</dt>
									<dd className="tabular-nums">
										{formatMoney(note.cgstPaise)}
									</dd>
									<dt className="text-muted-foreground">SGST</dt>
									<dd className="tabular-nums">
										{formatMoney(note.sgstPaise)}
									</dd>
								</>
							)
						) : (
							<>
								<dt className="text-muted-foreground">GST</dt>
								<dd className="tabular-nums">{formatMoney(totals.gst)}</dd>
							</>
						)}
						<dt className="font-medium">Total</dt>
						<dd className="font-medium tabular-nums">
							{formatMoney(totals.total)}
						</dd>
					</dl>
				)}
			</CardContent>
		</Card>
	);
}

/** Draft only: what posting will do (BR-PRT-40). The server stays the judge. */
export function ReturnPreviewCard({ prt }: { prt: PrtDetail }) {
	const preview = prt.preview;
	if (prt.status !== "draft" || !preview) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>What happens on post</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="list-disc space-y-1 pl-5 text-sm">
					{preview.stockOut.length > 0 ? (
						preview.stockOut.map((entry) => {
							const name =
								prt.lines.find((line) => line.itemId === entry.itemId)
									?.itemName ?? `Item ${entry.itemId}`;
							return (
								<li key={entry.itemId}>
									Stock −{formatQty(entry.qty, entry.uom, 3)} {name}
								</li>
							);
						})
					) : (
						<li>No stock movement</li>
					)}
					<li>Debit note {formatMoney(preview.debitNoteTotalPaise)}</li>
					<li>
						{preview.poEffect === "replacement"
							? "PO reopens for a replacement"
							: "PO unchanged"}
					</li>
				</ul>
			</CardContent>
		</Card>
	);
}

export function ReturnReasonCard({ prt }: { prt: PrtDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Reason</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1 text-sm">
				<p className="whitespace-pre-wrap">{prt.reason}</p>
				{prt.status === "cancelled" && prt.cancelReason ? (
					<p className="text-muted-foreground">Cancelled: {prt.cancelReason}</p>
				) : null}
			</CardContent>
		</Card>
	);
}
