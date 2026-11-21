"use client";

import Link from "next/link";
import type { ReactNode } from "react";

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
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatQtyTrim,
} from "@/lib/format";
import type { QuoteHeader, RfqDetails, RfqLine } from "@/types/rfq";

function lineStatusText(line: RfqLine): ReactNode {
	if (line.prLineCancelled) return "PR line cancelled";
	if (line.lineStatus === "dropped") return "Dropped";
	if (line.lineStatus === "open") return "Open";
	const cancelledPo = line.poStatus === "cancelled";
	return (
		<span className="flex flex-wrap items-center gap-x-1">
			Awarded to {line.awardedSupplierName ?? "–"}
			{line.poNumber && line.prId ? (
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
			{cancelledPo ? (
				<span className="text-muted-foreground">· PO cancelled</span>
			) : null}
		</span>
	);
}

export function RfqLinesCard({ data }: { data: RfqDetails }) {
	const names = new Map(data.suppliers.map((s) => [s.supplierId, s.name]));
	const rates = new Map((data.lineRates ?? []).map((r) => [r.rfqItemId, r]));
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lines ({data.lines.length})</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead>Contract rate</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.lines.map((line) => {
							const contract = rates.get(line.id)?.contract ?? [];
							const muted =
								line.lineStatus === "dropped" || line.prLineCancelled;
							return (
								<TableRow
									key={line.id}
									className={muted ? "text-muted-foreground" : undefined}
								>
									<TableCell className="whitespace-normal">
										<span className="font-mono">{line.prNumber}</span>
										<span className="block">
											{line.itemCode} · {line.itemName}
										</span>
										<span className="block text-[13px] text-muted-foreground">
											{lineStatusText(line)}
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatQtyTrim(line.qty, line.uom)}
									</TableCell>
									<TableCell>
										{contract.length === 0
											? "–"
											: contract.map((hint) => (
													<span
														key={hint.contractNumber}
														className="block tabular-nums"
														title={`${names.get(hint.supplierId) ?? "Supplier"} · ${hint.contractNumber}`}
													>
														{formatMoney(hint.ratePaise)}
													</span>
												))}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

export type QuoteAction = "submit" | "cancel";

export function RfqQuotesCard({
	data,
	canManage,
	canCancelSubmitted,
	onAction,
}: {
	data: RfqDetails;
	canManage: boolean;
	/** Cancelling a submitted quote on a sent RFQ needs `rfq.award` as well. */
	canCancelSubmitted: boolean;
	onAction: (action: QuoteAction, quote: QuoteHeader) => void;
}) {
	const { rfq, suppliers, quotes } = data;
	const live = quotes.filter((q) => q.status !== "cancelled");
	const quotedIds = new Set(live.map((q) => q.supplierId));
	const missing = suppliers.filter((s) => !quotedIds.has(s.supplierId));
	const open = rfq.status === "sent" || rfq.status === "partially_awarded";

	let body: ReactNode;
	if (rfq.status === "draft") {
		body = (
			<p className="text-sm text-muted-foreground">
				Send the RFQ to start quoting.
			</p>
		);
	} else if (quotes.length === 0) {
		body = (
			<div className="flex flex-wrap items-center gap-3 text-sm">
				<span className="text-muted-foreground">No quotes yet</span>
				{canManage && open ? (
					<Button type="button" size="sm" variant="outline" asChild>
						<Link href={`/rfq/${rfq.id}/quotes/new`}>Enter quote</Link>
					</Button>
				) : null}
			</div>
		);
	} else {
		body = (
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Supplier / quote ref</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Total landed</TableHead>
						<TableHead>
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{quotes.map((quote) => {
						const cancelled = quote.status === "cancelled";
						return (
							<TableRow
								key={quote.id}
								className={cancelled ? "text-muted-foreground" : undefined}
							>
								<TableCell className="whitespace-normal">
									{quote.supplierName}
									<Link
										href={`/rfq/${rfq.id}/quotes/${quote.id}`}
										className="block font-mono text-[13px] text-brand-accent hover:underline"
									>
										{quote.supplierQuoteRef ?? quote.quoteNumber}
									</Link>
								</TableCell>
								<TableCell>
									<span className="flex flex-wrap gap-1">
										<StatusBadge
											doc="quote"
											status={quote.isAwarded ? "awarded" : quote.status}
										/>
										{quote.isLate ? (
											<StatusBadge doc="rfqFlag" status="late" />
										) : null}
									</span>
									{quote.status === "cancelled" ? null : (
										<span className="mt-1 block text-[13px] text-muted-foreground">
											{quote.linesPriced} of {data.lines.length} lines priced
										</span>
									)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{quote.totalLandedPaise == null
										? "–"
										: formatMoney(quote.totalLandedPaise)}
									<span className="block text-[13px] text-muted-foreground">
										Valid till {formatDate(quote.validTill)}
									</span>
								</TableCell>
								<TableCell className="text-right">
									<span className="inline-flex flex-wrap justify-end gap-1">
										<Button type="button" size="sm" variant="ghost" asChild>
											<Link href={`/rfq/${rfq.id}/quotes/${quote.id}`}>
												Open
											</Link>
										</Button>
										{canManage && quote.status === "draft" && open ? (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => onAction("submit", quote)}
											>
												Submit
											</Button>
										) : null}
										{canManage &&
										quote.status === "submitted" &&
										!quote.isAwarded &&
										canCancelSubmitted ? (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => onAction("cancel", quote)}
											>
												Cancel
											</Button>
										) : null}
									</span>
								</TableCell>
							</TableRow>
						);
					})}
					{missing.map((supplier) => (
						<TableRow key={`missing-${supplier.supplierId}`}>
							<TableCell>{supplier.name}</TableCell>
							<TableCell colSpan={2} className="text-muted-foreground">
								No quote yet
							</TableCell>
							<TableCell className="text-right">
								{canManage && open ? (
									<Button type="button" size="sm" variant="ghost" asChild>
										<Link
											href={`/rfq/${rfq.id}/quotes/new?supplier=${supplier.supplierId}`}
										>
											Enter quote
										</Link>
									</Button>
								) : null}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Quotes</CardTitle>
			</CardHeader>
			<CardContent>{body}</CardContent>
		</Card>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex justify-between gap-3 text-sm">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right tabular-nums">{children}</dd>
		</div>
	);
}

/** Right pane: next step, summary and who did what (BR-RFQ-60). */
export function RfqSidePane({
	data,
	canManage,
	onSend,
}: {
	data: RfqDetails;
	canManage: boolean;
	onSend: () => void;
}) {
	const { rfq, suppliers, lines, quotes } = data;
	const quotedIds = new Set(
		quotes.filter((q) => q.status === "submitted").map((q) => q.supplierId),
	);
	const awarded = lines.filter((l) => l.lineStatus === "awarded");
	const allAwarded =
		lines.length > 0 && lines.every((l) => l.lineStatus !== "open");
	const poLinks = [
		...new Map(
			awarded
				.filter((l) => l.poNumber && l.poId)
				.map((l) => [l.poId, l] as const),
		).values(),
	];

	let next: ReactNode;
	if (rfq.status === "draft") {
		next = canManage ? (
			<Button type="button" onClick={onSend}>
				Send
			</Button>
		) : (
			<p className="text-sm text-muted-foreground">Waiting for purchase</p>
		);
	} else if (rfq.status === "sent" || rfq.status === "partially_awarded") {
		next =
			allAwarded && poLinks.length > 0 ? (
				<PoLinks links={poLinks} />
			) : canManage ? (
				<Button type="button" asChild>
					<Link href={`/rfq/${rfq.id}/quotes/new`}>Enter quote</Link>
				</Button>
			) : (
				<p className="text-sm text-muted-foreground">Waiting for purchase</p>
			);
	} else if (poLinks.length > 0) {
		next = <PoLinks links={poLinks} />;
	} else {
		next = <p className="text-sm text-muted-foreground">Nothing more to do.</p>;
	}

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Next step</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{rfq.status !== "draft" ? (
						<p className="text-sm">
							Quotes in: {quotedIds.size} of {suppliers.length}
						</p>
					) : null}
					{next}
					<p className="text-[13px] text-muted-foreground">
						Quote due {formatDate(rfq.dueDate)}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Audit</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="space-y-1.5">
						<Row label="Created">
							{rfq.createdByName ?? "–"}, {formatDateTime(rfq.createdAt)}
						</Row>
						{rfq.sentAt ? (
							<Row label="Sent">
								{rfq.sentByName ?? "–"}, {formatDateTime(rfq.sentAt)}
							</Row>
						) : null}
						{rfq.closedAt ? (
							<Row label="Closed">
								{rfq.closedByName ?? "–"}, {formatDateTime(rfq.closedAt)}
							</Row>
						) : null}
						{rfq.closeReason ? (
							<Row label="Reason">{rfq.closeReason}</Row>
						) : null}
						{rfq.cancelledAt ? (
							<Row label="Cancelled">
								{rfq.cancelledByName ?? "–"}, {formatDateTime(rfq.cancelledAt)}
							</Row>
						) : null}
						{rfq.cancelReason ? (
							<Row label="Reason">{rfq.cancelReason}</Row>
						) : null}
					</dl>
				</CardContent>
			</Card>
		</div>
	);
}

function PoLinks({ links }: { links: RfqLine[] }) {
	return (
		<ul className="space-y-1 text-sm">
			{links.map((line) => (
				<li key={line.poId}>
					<Link
						href={`/purchase-orders/${line.prId}`}
						className="font-mono text-brand-accent hover:underline"
					>
						{line.poNumber}
					</Link>
				</li>
			))}
		</ul>
	);
}
