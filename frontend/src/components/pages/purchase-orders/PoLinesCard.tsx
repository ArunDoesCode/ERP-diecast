"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { PoPageItem } from "@/lib/api/purchase-orders/detail-types";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

export function poOpenQty(item: PoPageItem) {
	return (
		item.openQty ??
		Math.max(item.qty - item.receivedQty - (item.pendingQaQty ?? 0), 0)
	);
}

function qty(value: number, uom: string | null) {
	return formatQty(value, uom, Number.isInteger(value) ? 0 : 3);
}

const RATE_SOURCE_LABEL = { contract: "Contract", quote: "Quote" } as const;

/** Contract no. and rate source of a line, plus a rate override and who did it (BR-RFQ-30, 51). */
function RateSourceNote({ item }: { item: PoPageItem }) {
	if (!item.rateSource && !item.contractNumber && !item.quoteNumber)
		return null;
	return (
		<span className="block text-[13px] text-muted-foreground">
			{item.rateSource ? RATE_SOURCE_LABEL[item.rateSource] : null}
			{item.contractNumber ? (
				<span className="font-mono"> {item.contractNumber}</span>
			) : null}
			{item.quoteNumber ? (
				<span className="font-mono"> {item.quoteNumber}</span>
			) : null}
			{item.rateOverrideReason ? (
				<span className="block">
					Override
					{item.contractRatePaise != null
						? ` · was ${formatMoney(item.contractRatePaise)}`
						: ""}
					{` · ${item.rateOverrideReason}`}
					{item.rateOverrideByName ? ` · by ${item.rateOverrideByName}` : ""}
					{item.rateOverrideAt
						? `, ${formatDateTime(item.rateOverrideAt)}`
						: ""}
				</span>
			) : null}
		</span>
	);
}

/** PO lines: ordered, accepted, awaiting QA, open (BR-FF-43); returned (BR-PRT-38). */
export function PoLinesCard({ items }: { items: PoPageItem[] }) {
	const showReturned = items.some((item) => item.returnedQty !== undefined);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lines</CardTitle>
			</CardHeader>
			<CardContent>
				<Table className="[&_td]:px-2 [&_th]:px-2">
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Ordered</TableHead>
							<TableHead className="text-right">Received</TableHead>
							<TableHead className="text-right">Awaiting QA</TableHead>
							<TableHead className="text-right">Open</TableHead>
							{showReturned ? (
								<TableHead className="text-right">Returned</TableHead>
							) : null}
							<TableHead className="text-right">Rate</TableHead>
							<TableHead className="text-right">GST</TableHead>
							<TableHead className="text-right">Amount</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.id}>
								<TableCell>
									<div className="flex flex-col">
										<span className="font-medium">
											{item.itemName ?? `Item ${item.itemId}`}
										</span>
										<span className="text-muted-foreground">
											{item.itemSku ?? ""}
										</span>
										<RateSourceNote item={item} />
									</div>
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{qty(item.qty, item.uom)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{qty(item.receivedQty, item.uom)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{qty(item.pendingQaQty ?? 0, item.uom)}
								</TableCell>
								<TableCell className="text-right font-semibold tabular-nums">
									{qty(poOpenQty(item), item.uom)}
								</TableCell>
								{showReturned ? (
									<TableCell className="text-right tabular-nums">
										{qty(item.returnedQty ?? 0, item.uom)}
									</TableCell>
								) : null}
								<TableCell className="text-right tabular-nums">
									{formatMoney(item.unitPricePaise)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{item.gstPercent ?? 0}%
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatMoney(
										item.lineValuePaise ??
											Math.round(item.qty * item.unitPricePaise),
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
