"use client";

import { IconDots } from "@tabler/icons-react";
import { useState } from "react";

import { GrnBypassAlert } from "@/components/pages/grn/GrnBypassAlert";
import { GrnCorrectionAlert } from "@/components/pages/grn/GrnCorrectionAlert";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import type { GrnItemDetail } from "@/types/grn";

export function isPendingLine(item: GrnItemDetail) {
	return item.qaStatus === "pending" && !item.isQaBypassed;
}

/** Lines of one receipt. Inspect (one QA decision) is lifted to the page so the header button shares its dialog. */
export function GrnLinesTable({
	grnId,
	poId,
	items,
	onInspect,
}: {
	grnId: number;
	poId: number;
	items: GrnItemDetail[];
	onInspect: (line: GrnItemDetail) => void;
}) {
	const canDecideQa = useCan("grn.qa_decide");
	const canBypassQa = useCan("grn.qa_bypass");
	const canCorrectLine = useCan("grn.correct");
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
						<TableHead>Arrived</TableHead>
						<TableHead>Accepted</TableHead>
						<TableHead>Rejected</TableHead>
						<TableHead>QA status</TableHead>
						<TableHead className="w-40">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={6}
								className="py-8 text-center text-muted-foreground"
							>
								No lines on this GRN.
							</TableCell>
						</TableRow>
					) : (
						items.map((item) => {
							const pending = isPendingLine(item);
							const canCorrect =
								(item.qaStatus === "passed" || item.isQaBypassed === true) &&
								canCorrectLine;
							const canBypass = pending && canBypassQa;

							return (
								<TableRow key={item.id}>
									<TableCell>
										<div className="flex flex-col">
											<span className="font-medium">{item.itemName}</span>
											<span className="text-muted-foreground">
												{item.itemSku}
											</span>
											{item.batchNumber ? (
												<span className="text-sm text-muted-foreground">
													Batch/heat: {item.batchNumber}
												</span>
											) : null}
											{item.isQaBypassed ? (
												<span className="text-sm text-muted-foreground">
													QA bypassed: {item.qaBypassReason ?? "-"}
												</span>
											) : null}
											{item.overReceiptReason ? (
												<span className="text-sm text-warning">
													Over-receipt +{item.overReceiptExcessQty ?? 0}:{" "}
													{item.overReceiptReason}
												</span>
											) : null}
										</div>
									</TableCell>
									<TableCell className="tabular-nums">
										{item.receivedQty} {item.uom}
									</TableCell>
									<TableCell className="tabular-nums">
										{item.acceptedQty} {item.uom}
										{item.correctedQty > 0 ? (
											<span className="block text-sm text-muted-foreground">
												{item.correctedQty} corrected, net {item.netAcceptedQty}
											</span>
										) : null}
									</TableCell>
									<TableCell className="tabular-nums">
										{item.rejectedQty ?? 0} {item.uom}
									</TableCell>
									<TableCell>
										<StatusBadge
											doc="grnQa"
											status={item.qaStatus ?? "pending"}
										/>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap items-center justify-end gap-2">
											{pending && canDecideQa ? (
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => onInspect(item)}
												>
													Inspect
												</Button>
											) : null}
											{canBypass || canCorrect ? (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															type="button"
															size="sm"
															variant="outline"
															aria-label={`More actions for ${item.itemName}`}
														>
															<IconDots className="size-3.5" />
															More
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														{canBypass ? (
															<DropdownMenuItem
																onSelect={() => setBypassLine(item)}
															>
																Bypass QA
															</DropdownMenuItem>
														) : null}
														{canCorrect ? (
															<DropdownMenuItem
																onSelect={() => setCorrectionLine(item)}
															>
																Correction
															</DropdownMenuItem>
														) : null}
													</DropdownMenuContent>
												</DropdownMenu>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							);
						})
					)}
				</TableBody>
			</Table>

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
