"use client";

import Link from "next/link";
import { memo, useMemo } from "react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { istTodayIso } from "@/lib/ist-date";
import {
	type ComparisonCell,
	type ComparisonRow,
	RFQ_REASON_MAX,
	RFQ_REASON_MIN,
	type RfqLine,
} from "@/types/rfq";

const STATE_ORDER: Record<string, number> = {
	priced: 0,
	expired: 1,
	inactive: 2,
	not_quoted: 3,
	no_quote: 4,
};

function sortCells(cells: ComparisonCell[]) {
	return [...cells].sort((a, b) => {
		const byState = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
		if (byState !== 0) return byState;
		return (a.landedRatePaise ?? Infinity) - (b.landedRatePaise ?? Infinity);
	});
}

type Props = {
	row: ComparisonRow;
	/** The RFQ line from the details call: award, PO and reason once awarded. */
	line: RfqLine | undefined;
	supplierNames: Map<number, string>;
	/** Award controls shown (rfq.award + po.manage, open RFQ). */
	canPick: boolean;
	pickedQuoteItemId: number | undefined;
	reason: string;
	showReasonError: boolean;
	onPick: (rfqItemId: number, quoteItemId: number) => void;
	onReason: (rfqItemId: number, reason: string) => void;
};

function CompareBlockImpl({
	row,
	line,
	supplierNames,
	canPick,
	pickedQuoteItemId,
	reason,
	showReasonError,
	onPick,
	onReason,
}: Props) {
	const cells = useMemo(() => sortCells(row.cells), [row.cells]);
	const today = istTodayIso();
	const open = row.lineStatus === "open" && !row.prLineCancelled;
	const interactive = canPick && open;
	const pickedCell = cells.find((c) => c.quoteItemId === pickedQuoteItemId);
	const needsReason = Boolean(pickedCell && !pickedCell.isLowest);
	const trimmed = reason.trim();
	const reasonError =
		showReasonError &&
		needsReason &&
		(trimmed.length < RFQ_REASON_MIN || trimmed.length > RFQ_REASON_MAX);
	const contractBySupplier = new Map(
		(row.contract ?? []).map((c) => [c.supplierId, c]),
	);
	const titleId = `cmp-${row.rfqItemId}`;

	return (
		<Card aria-labelledby={titleId}>
			<CardHeader>
				<CardTitle id={titleId}>
					{row.itemCode} · {row.itemName} · {formatQty(row.qty, row.uom, 3)}
				</CardTitle>
				<p className="text-[13px] text-muted-foreground">
					{row.lastPoRatePaise !== undefined ? (
						<>Last PO {formatMoney(row.lastPoRatePaise)}</>
					) : null}
					{row.lastPoRatePaise !== undefined && row.contract?.length
						? " · "
						: null}
					{row.contract?.length
						? row.contract
								.map(
									(c) =>
										`Contract ${supplierNames.get(c.supplierId) ?? "supplier"} ${formatMoney(c.ratePaise)}`,
								)
								.join(" · ")
						: null}
				</p>
				{row.lineStatus === "awarded" && line ? (
					<p className="text-sm">
						Awarded to {line.awardedSupplierName ?? "–"}
						{line.poNumber ? (
							<>
								{" → "}
								<Link
									href={`/purchase-orders/${line.prId}`}
									className="font-mono text-brand-accent hover:underline"
								>
									{line.poNumber}
								</Link>
							</>
						) : null}
						{line.awardReason ? (
							<span className="text-muted-foreground">
								{" "}
								· {line.awardReason}
							</span>
						) : null}
					</p>
				) : row.prLineCancelled ? (
					<p className="text-sm text-muted-foreground">PR line cancelled</p>
				) : row.lineStatus === "dropped" ? (
					<p className="text-sm text-muted-foreground">Dropped</p>
				) : null}
			</CardHeader>
			<CardContent className="space-y-3">
				<Table>
					<TableHeader>
						<TableRow>
							{interactive ? (
								<TableHead className="w-12">
									<span className="sr-only">Pick</span>
								</TableHead>
							) : null}
							<TableHead>Supplier</TableHead>
							<TableHead className="text-right">Rate</TableHead>
							<TableHead className="text-right">GST %</TableHead>
							<TableHead className="text-right">Freight</TableHead>
							<TableHead className="text-right">Landed per unit</TableHead>
							<TableHead className="text-right">Lead days</TableHead>
							<TableHead>Valid till</TableHead>
							<TableHead className="text-right">Terms</TableHead>
							<TableHead>Flags</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{cells.map((cell) => {
							const name =
								supplierNames.get(cell.supplierId) ??
								`Supplier #${cell.supplierId}`;
							const priced = cell.state === "priced";
							const muted = cell.state !== "priced";
							const canChoose =
								interactive &&
								priced &&
								cell.eligible &&
								cell.quoteItemId !== null;
							const contract = contractBySupplier.get(cell.supplierId);
							const expiredNow =
								cell.state === "expired" ||
								(cell.validTill !== null && cell.validTill < today);
							return (
								<TableRow
									key={cell.supplierId}
									className={muted ? "text-muted-foreground" : undefined}
								>
									{interactive ? (
										<TableCell>
											<label className="flex size-11 items-center justify-center">
												<input
													type="radio"
													name={`pick-${row.rfqItemId}`}
													className="accent-primary"
													style={{ width: 20, height: 20 }}
													aria-label={`Award ${row.itemCode} to ${name}`}
													disabled={!canChoose}
													checked={
														cell.quoteItemId !== null &&
														pickedQuoteItemId === cell.quoteItemId
													}
													onChange={() =>
														cell.quoteItemId !== null &&
														onPick(row.rfqItemId, cell.quoteItemId)
													}
												/>
											</label>
										</TableCell>
									) : null}
									<TableCell>{name}</TableCell>
									<TableCell className="text-right tabular-nums">
										{priced || cell.state === "expired"
											? formatMoney(cell.ratePaise)
											: "–"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{cell.gstPercent != null ? `${cell.gstPercent}%` : "–"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{cell.freightPaise ? formatMoney(cell.freightPaise) : "–"}
									</TableCell>
									<TableCell
										className={`text-right tabular-nums ${priced ? "font-semibold" : ""}`}
									>
										{formatMoney(cell.landedRatePaise)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{cell.leadDays != null ? `${cell.leadDays}d` : "–"}
									</TableCell>
									<TableCell>{formatDate(cell.validTill)}</TableCell>
									<TableCell className="text-right tabular-nums">
										{cell.paymentTermsDays != null
											? `${cell.paymentTermsDays}d`
											: "–"}
									</TableCell>
									<TableCell>
										<span className="flex flex-wrap items-center gap-1">
											{cell.isLowest ? (
												<StatusBadge doc="rfqFlag" status="lowest" />
											) : null}
											{cell.isLate ? (
												<StatusBadge doc="rfqFlag" status="late" />
											) : null}
											{expiredNow && cell.state !== "no_quote" ? (
												<StatusBadge doc="rfqFlag" status="expired" />
											) : null}
											{cell.state === "not_quoted" ? (
												<StatusBadge doc="rfqFlag" status="not_quoted" />
											) : null}
											{cell.state === "inactive" ? (
												<StatusBadge doc="rfqFlag" status="inactive" />
											) : null}
											{cell.state === "no_quote" ? (
												<span className="text-[13px]">No quote yet</span>
											) : null}
											{contract && priced ? (
												<span className="text-[13px]">
													PO will use contract {formatMoney(contract.ratePaise)}
												</span>
											) : null}
										</span>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
				{interactive && needsReason ? (
					<div className="min-h-19 space-y-1">
						<Label htmlFor={`reason-${row.rfqItemId}`}>
							Why not the lowest? *
						</Label>
						<Textarea
							id={`reason-${row.rfqItemId}`}
							value={reason}
							maxLength={RFQ_REASON_MAX}
							aria-invalid={reasonError ? true : undefined}
							onChange={(event) => onReason(row.rfqItemId, event.target.value)}
						/>
						<div className="flex justify-between gap-2 text-[13px]">
							<span
								className={
									reasonError ? "text-destructive" : "text-muted-foreground"
								}
							>
								{RFQ_REASON_MIN} to {RFQ_REASON_MAX} characters
							</span>
							<span className="text-muted-foreground tabular-nums">
								{reason.length} / {RFQ_REASON_MAX}
							</span>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

export const CompareBlock = memo(CompareBlockImpl);
