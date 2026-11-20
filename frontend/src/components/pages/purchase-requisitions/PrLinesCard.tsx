"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { PrPageItem } from "@/lib/api/purchase-requisitions/detail-types";
import { formatDate, formatMoney, formatQty } from "@/lib/format";

function qty(item: PrPageItem) {
	return formatQty(
		item.requestedQty,
		item.uom,
		Number.isInteger(item.requestedQty) ? 0 : 3,
	);
}

/** Requisition lines with ordered qty and the PO each line is on (BR-FF-43). */
export function PrLinesCard({
	items,
	canOpenPo,
	onCancelLine,
}: {
	items: PrPageItem[];
	/** false = PO numbers are plain text (BR-FF-03). */
	canOpenPo: boolean;
	onCancelLine?: (item: PrPageItem) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lines</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Estimate</TableHead>
							<TableHead>Required by</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>On order</TableHead>
							{onCancelLine ? (
								<TableHead>
									<span className="sr-only">Actions</span>
								</TableHead>
							) : null}
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => {
							const poNumber = item.onPoNumber ?? item.linkedPoNumber ?? null;
							const poId = item.onPoId ?? item.linkedPoId ?? null;
							return (
								<TableRow key={item.id}>
									<TableCell>
										<div className="flex flex-col">
											<span className="font-medium">
												{item.itemName ?? "–"}
											</span>
											<span className="text-muted-foreground">
												{item.itemSku ?? item.itemCategory ?? ""}
											</span>
										</div>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{qty(item)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{item.estRatePaise === undefined
											? "–"
											: formatMoney(
													Math.round(item.estRatePaise * item.requestedQty),
												)}
									</TableCell>
									<TableCell>{formatDate(item.expectedDate)}</TableCell>
									<TableCell>
										<StatusBadge
											doc="prLine"
											status={item.status ?? "pending"}
										/>
									</TableCell>
									<TableCell>
										{poNumber === null ? (
											"–"
										) : canOpenPo && poId !== null ? (
											<Link
												href={`/purchase-orders/${poId}`}
												className="font-mono text-brand-accent hover:underline"
											>
												{poNumber}
											</Link>
										) : (
											<span className="font-mono">{poNumber}</span>
										)}
									</TableCell>
									{onCancelLine ? (
										<TableCell>
											{item.status === "pending" ? (
												<Button
													type="button"
													size="sm"
													variant="ghost"
													onClick={() => onCancelLine(item)}
												>
													Cancel line
												</Button>
											) : null}
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
