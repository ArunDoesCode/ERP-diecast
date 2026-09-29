"use client";

import Link from "next/link";

import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	ChallanSettlementRow,
	ScoChargeDue,
	ScoLine,
} from "@/types/subcontracting";

export function ScoSettlementCard({
	items,
	chargeDue,
	settlements,
}: {
	items: ScoLine[];
	chargeDue?: ScoChargeDue;
	settlements?: ChallanSettlementRow[];
}) {
	const rows = settlements ?? [];
	const lineName = (scoItemId: number) => {
		const line = items.find((item) => item.id === scoItemId);
		return line ? `${line.rawItemSku} · ${line.rawItemName}` : `#${scoItemId}`;
	};

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>At vendor and charge due</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Raw item</TableHead>
								<TableHead className="text-right">At vendor</TableHead>
								<TableHead className="text-right">Pending QA</TableHead>
								<TableHead className="text-right">Accepted</TableHead>
								<TableHead className="text-right">Charge</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((line) => (
								<TableRow key={line.id}>
									<TableCell>
										{line.rawItemSku} · {line.rawItemName}
									</TableCell>
									<TableCell className="text-right">
										{line.qtyAtVendor ?? 0}
									</TableCell>
									<TableCell className="text-right">
										{line.pendingQaQty ?? 0}
									</TableCell>
									<TableCell className="text-right">
										{line.acceptedQty}
									</TableCell>
									<TableCell className="text-right">
										{formatPaise(line.chargeDuePaise ?? 0)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<div className="grid grid-cols-3 gap-3 text-xs">
						<div>
							<p className="text-muted-foreground">Charge (ex GST)</p>
							<p className="font-medium">
								{formatPaise(chargeDue?.subtotalPaise ?? 0)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">GST</p>
							<p className="font-medium">
								{formatPaise(chargeDue?.gstPaise ?? 0)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">Total due</p>
							<p className="font-medium">
								{formatPaise(chargeDue?.totalPaise ?? 0)}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Challan settlement</CardTitle>
				</CardHeader>
				<CardContent>
					{rows.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							No challans to settle yet.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Challan</TableHead>
									<TableHead>Item</TableHead>
									<TableHead className="text-right">Settled</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.challanLineId}>
										<TableCell>
											<Link
												href={`/subcontracting/challans/${row.challanId}`}
												className="font-medium underline-offset-2 hover:underline"
											>
												{row.challanNumber}
											</Link>
										</TableCell>
										<TableCell>{lineName(row.scoItemId)}</TableCell>
										<TableCell className="text-right">
											{row.settledQty} / {row.qty}
										</TableCell>
										<TableCell>
											<Badge variant={row.settled ? "default" : "secondary"}>
												{row.settled ? "Settled" : "Open"}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
