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
import { formatMoney, formatQty } from "@/lib/format";

export function poOpenQty(item: PoPageItem) {
	return (
		item.openQty ??
		Math.max(item.qty - item.receivedQty - (item.pendingQaQty ?? 0), 0)
	);
}

function qty(value: number, uom: string | null) {
	return formatQty(value, uom, Number.isInteger(value) ? 0 : 3);
}

/** PO lines: ordered, accepted, awaiting QA, open (BR-FF-43). */
export function PoLinesCard({ items }: { items: PoPageItem[] }) {
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
