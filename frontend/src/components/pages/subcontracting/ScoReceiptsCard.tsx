"use client";

import { useState } from "react";

import { QaDecisionDialog } from "@/components/pages/subcontracting/QaDecisionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	useReceiptDetailQuery,
	useScoReceiptsQuery,
} from "@/lib/api/subcontracting/queries";
import { formatScoDate } from "@/lib/sco-format";
import type { ReceiptQaStatus } from "@/types/subcontracting";

const QA_LABEL: Record<ReceiptQaStatus, string> = {
	pending_qa: "Pending QA",
	accepted: "Accepted",
	partial_accepted: "Partly accepted",
	rejected: "Rejected",
};

function QaBadge({ status }: { status: ReceiptQaStatus }) {
	return (
		<Badge variant={status === "pending_qa" ? "secondary" : "outline"}>
			{QA_LABEL[status]}
		</Badge>
	);
}

function ReceiptDetail({
	scoId,
	receiptId,
	canQa,
}: {
	scoId: number;
	receiptId: number;
	canQa: boolean;
}) {
	const query = useReceiptDetailQuery(receiptId);
	if (query.isLoading) return <Skeleton className="h-16" />;
	if (!query.data?.success) {
		return (
			<p className="text-xs text-muted-foreground">
				{query.data?.message ?? "Receipt not found."}
			</p>
		);
	}
	const { lines, settlements } = query.data.data;

	return (
		<div className="space-y-3">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Finished item</TableHead>
						<TableHead className="text-right">Processed</TableHead>
						<TableHead className="text-right">Unprocessed</TableHead>
						<TableHead className="text-right">Accepted</TableHead>
						<TableHead className="text-right">Rejected</TableHead>
						<TableHead>QA</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{lines.map((line) => (
						<TableRow key={line.id}>
							<TableCell>
								{line.finishedItemSku} · {line.finishedItemName}
								{line.qaNotes ? (
									<span className="block text-[11px] text-muted-foreground">
										{line.qaNotes}
									</span>
								) : null}
							</TableCell>
							<TableCell className="text-right">{line.processedQty}</TableCell>
							<TableCell className="text-right">
								{line.unprocessedQty}
							</TableCell>
							<TableCell className="text-right">
								{line.acceptedQty ?? "-"}
							</TableCell>
							<TableCell className="text-right">
								{line.rejectedQty ?? "-"}
							</TableCell>
							<TableCell>
								<QaBadge status={line.qaStatus} />
							</TableCell>
							<TableCell className="text-right">
								{canQa && line.qaStatus === "pending_qa" ? (
									<QaDecisionDialog
										scoId={scoId}
										receiptId={receiptId}
										line={line}
									/>
								) : null}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<div>
				<p className="mb-1 text-xs font-medium">Challans settled</p>
				{settlements.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No challan settled by this receipt.
					</p>
				) : (
					<ul className="space-y-0.5 text-xs">
						{settlements.map((row) => (
							<li key={row.id}>
								{row.challanNumber}: {row.qty} pcs settled
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

export function ScoReceiptsCard({
	scoId,
	canQa,
}: {
	scoId: number;
	canQa: boolean;
}) {
	const query = useScoReceiptsQuery(scoId);
	const receipts = query.data?.success ? query.data.data : [];
	const [openId, setOpenId] = useState<number | null>(null);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Receipts</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<Skeleton className="h-16" />
				) : receipts.length === 0 ? (
					<p className="text-xs text-muted-foreground">No receipts yet.</p>
				) : (
					<div className="space-y-3">
						{receipts.map((receipt) => (
							<div key={receipt.id} className="rounded-md border p-3">
								<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
									<div className="space-y-0.5">
										<p className="font-medium">
											{receipt.grnNumber} · vendor challan{" "}
											{receipt.vendorChallanNo}
										</p>
										<p className="text-muted-foreground">
											{formatScoDate(receipt.receivedDate)}
											{receipt.createdByName
												? ` · ${receipt.createdByName}`
												: ""}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<QaBadge status={receipt.status} />
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() =>
												setOpenId(openId === receipt.id ? null : receipt.id)
											}
										>
											{openId === receipt.id ? "Hide" : "View"}
										</Button>
									</div>
								</div>
								{openId === receipt.id ? (
									<div className="mt-3">
										<ReceiptDetail
											scoId={scoId}
											receiptId={receipt.id}
											canQa={canQa}
										/>
									</div>
								) : null}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
