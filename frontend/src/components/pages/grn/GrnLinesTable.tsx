"use client";

import { useState } from "react";

import { GrnBypassAlert } from "@/components/pages/grn/GrnBypassAlert";
import { GrnCorrectionAlert } from "@/components/pages/grn/GrnCorrectionAlert";
import { GrnQaDecisionModal } from "@/components/pages/grn/GrnQaDecisionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import { getGrnQaStatusBadgeStyle } from "@/lib/grn-status-badge";
import { humanizeStatusLabel } from "@/lib/pr-status-badge";
import type { GrnItemDetail } from "@/types/grn";

export function GrnLinesTable({
	grnId,
	poId,
	items,
}: {
	grnId: number;
	poId: number;
	items: GrnItemDetail[];
}) {
	const canDecideQa = useCan("grn.qa_decide");
	const canBypassQa = useCan("grn.qa_bypass");
	const canCorrectLine = useCan("grn.correct");
	const [qaDecisionLine, setQaDecisionLine] = useState<GrnItemDetail | null>(
		null,
	);
	const [bypassLine, setBypassLine] = useState<GrnItemDetail | null>(null);
	const [correctionLine, setCorrectionLine] = useState<GrnItemDetail | null>(
		null,
	);

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Item</TableHead>
						<TableHead>Ordered</TableHead>
						<TableHead>Received</TableHead>
						<TableHead>Accepted</TableHead>
						<TableHead>Net accepted</TableHead>
						<TableHead>Rejected</TableHead>
						<TableHead>QA status</TableHead>
						<TableHead className="w-48" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={8}
								className="py-8 text-center text-muted-foreground"
							>
								No lines on this GRN.
							</TableCell>
						</TableRow>
					) : (
						items.map((item) => {
							const badgeStyle = getGrnQaStatusBadgeStyle(item.qaStatus);
							const isPendingQa =
								item.qaStatus === "pending" && !item.isQaBypassed;
							const canCorrect =
								item.qaStatus === "passed" || item.isQaBypassed === true;

							return (
								<TableRow key={item.id}>
									<TableCell>
										<div className="flex flex-col">
											<span className="font-medium">{item.itemName}</span>
											<span className="text-muted-foreground">
												{item.itemSku}
											</span>
											{item.batchNumber ? (
												<span className="text-xs text-muted-foreground">
													Batch/heat: {item.batchNumber}
												</span>
											) : null}
											{item.isQaBypassed ? (
												<span className="text-xs text-muted-foreground">
													QA bypassed: {item.qaBypassReason ?? "-"}
												</span>
											) : null}
											{item.overReceiptReason ? (
												<span className="text-xs text-amber-700">
													Over-receipt +{item.overReceiptExcessQty ?? 0}:{" "}
													{item.overReceiptReason}
												</span>
											) : null}
										</div>
									</TableCell>
									<TableCell>{item.orderedQty}</TableCell>
									<TableCell>{item.receivedQty}</TableCell>
									<TableCell>{item.acceptedQty}</TableCell>
									<TableCell>
										{item.netAcceptedQty}
										{item.correctedQty > 0 ? (
											<span className="block text-xs text-muted-foreground">
												{item.correctedQty} corrected
											</span>
										) : null}
									</TableCell>
									<TableCell>{item.rejectedQty ?? 0}</TableCell>
									<TableCell>
										<Badge
											variant={badgeStyle.variant}
											className={badgeStyle.className}
										>
											{humanizeStatusLabel(item.qaStatus ?? "pending")}
										</Badge>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-2">
											{isPendingQa ? (
												<>
													{canDecideQa ? (
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() => setQaDecisionLine(item)}
														>
															Decide
														</Button>
													) : null}
													{canBypassQa ? (
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() => setBypassLine(item)}
														>
															Bypass
														</Button>
													) : null}
												</>
											) : null}
											{canCorrect && canCorrectLine ? (
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => setCorrectionLine(item)}
												>
													Correct
												</Button>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							);
						})
					)}
				</TableBody>
			</Table>

			{qaDecisionLine ? (
				<GrnQaDecisionModal
					grnId={grnId}
					poId={poId}
					line={qaDecisionLine}
					open={qaDecisionLine !== null}
					onOpenChange={(open) => {
						if (!open) setQaDecisionLine(null);
					}}
				/>
			) : null}

			{bypassLine ? (
				<GrnBypassAlert
					grnId={grnId}
					poId={poId}
					line={bypassLine}
					open={bypassLine !== null}
					onOpenChange={(open) => {
						if (!open) setBypassLine(null);
					}}
				/>
			) : null}

			{correctionLine ? (
				<GrnCorrectionAlert
					grnId={grnId}
					poId={poId}
					line={correctionLine}
					open={correctionLine !== null}
					onOpenChange={(open) => {
						if (!open) setCorrectionLine(null);
					}}
				/>
			) : null}
		</>
	);
}
