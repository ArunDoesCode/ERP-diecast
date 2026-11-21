import Link from "next/link";
import type { ReactNode } from "react";
import { transferQty } from "@/components/pages/stock-transfers/transfer-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { StActorRef, StDetail } from "@/types/stock-transfer";

const COLS = "xl:grid-cols-[minmax(0,1fr)_7.5rem_6rem_8rem]";

export function TransferLinesCard({ transfer }: { transfer: StDetail }) {
	const isDraft = transfer.status === "draft";
	const hasCost =
		transfer.status === "posted" || transfer.status === "reversed";
	const total = transfer.lines.reduce(
		(sum, line) => sum + (line.postedValuePaise ?? 0),
		0,
	);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lines</CardTitle>
			</CardHeader>
			<CardContent>
				<div
					aria-hidden="true"
					className={`hidden gap-x-3 border-b bg-table-header px-3 py-2 text-[13px] font-medium text-muted-foreground xl:grid ${COLS}`}
				>
					<span>Item</span>
					<span className="text-right">Qty</span>
					<span className="text-right">
						{hasCost ? "Rate" : isDraft ? "Available" : ""}
					</span>
					<span className="text-right">{hasCost ? "Value" : ""}</span>
				</div>
				<ul className="divide-y">
					{transfer.lines.map((line) => (
						<li
							key={line.lineId}
							className={`grid gap-x-3 gap-y-1 px-3 py-2 text-sm xl:items-center ${COLS}`}
						>
							<div className="min-w-0">
								<span className="font-mono text-[13px] text-muted-foreground">
									{line.sku}
								</span>
								<p className="break-words">{line.name}</p>
							</div>
							<Pair label="Qty">{transferQty(line.qty, line.unit)}</Pair>
							{hasCost ? (
								<>
									<Pair label="Rate">
										{formatMoney(line.postedUnitCostPaise)}
									</Pair>
									<Pair label="Value">
										{formatMoney(line.postedValuePaise)}
									</Pair>
								</>
							) : isDraft ? (
								<Pair label="Available at source">
									{transferQty(line.sourceBalanceQty, line.unit)}
								</Pair>
							) : null}
						</li>
					))}
				</ul>
				{hasCost ? (
					<div className="flex justify-end gap-3 border-t px-3 pt-2 text-sm font-medium">
						<span>Total</span>
						<span className="tabular-nums">{formatMoney(total)}</span>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

/** Label + value; the label shows only when the row stacks (below 1280 px). */
function Pair({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-2 xl:block xl:text-right">
			<span className="text-[13px] text-muted-foreground xl:hidden">
				{label}
			</span>
			<span className="tabular-nums">{children}</span>
		</div>
	);
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex justify-between gap-3">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words text-right">{value}</dd>
		</div>
	);
}

const who = (actor: StActorRef | null, at: string | null) =>
	`${actor?.name ?? "–"}, ${formatDateTime(at)}`;

export function TransferDetailsCard({ transfer }: { transfer: StDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="space-y-1.5 text-sm">
					<Fact
						label="Created"
						value={who(transfer.createdBy, transfer.createdAt)}
					/>
					{transfer.notes ? <Fact label="Note" value={transfer.notes} /> : null}
					{transfer.postedAt ? (
						<Fact
							label="Posted"
							value={who(transfer.postedBy, transfer.postedAt)}
						/>
					) : null}
					{transfer.cancelledAt ? (
						<Fact
							label="Cancelled"
							value={who(transfer.cancelledBy, transfer.cancelledAt)}
						/>
					) : null}
					{transfer.reversedAt ? (
						<Fact
							label="Reversed"
							value={who(transfer.reversedBy, transfer.reversedAt)}
						/>
					) : null}
					{transfer.reverseReason ? (
						<Fact label="Reason" value={transfer.reverseReason} />
					) : null}
				</dl>
			</CardContent>
		</Card>
	);
}

type HistoryEntry = { key: string; at: string; text: string };

export function TransferHistoryCard({ transfer }: { transfer: StDetail }) {
	const events: HistoryEntry[] = [
		{
			key: "created",
			at: transfer.createdAt,
			text: `Created by ${transfer.createdBy?.name ?? "–"}`,
		},
	];
	// Only a real edit: later than Created and before the post / cancel / reverse.
	const closedAt = [
		transfer.postedAt,
		transfer.cancelledAt,
		transfer.reversedAt,
	].filter((at): at is string => at !== null);
	const SECOND = 1000;
	const updatedMs = Date.parse(transfer.lastUpdatedAt);
	const editedAfterCreate = updatedMs - Date.parse(transfer.createdAt) > SECOND;
	const editedBeforeClose = closedAt.every(
		(at) => Date.parse(at) - updatedMs > SECOND,
	);
	if (editedAfterCreate && editedBeforeClose && transfer.lastUpdatedBy) {
		events.push({
			key: "updated",
			at: transfer.lastUpdatedAt,
			text: `Last updated by ${transfer.lastUpdatedBy.name}`,
		});
	}
	if (transfer.postedAt) {
		events.push({
			key: "posted",
			at: transfer.postedAt,
			text: `Posted by ${transfer.postedBy?.name ?? "–"}`,
		});
	}
	if (transfer.cancelledAt) {
		events.push({
			key: "cancelled",
			at: transfer.cancelledAt,
			text: `Cancelled by ${transfer.cancelledBy?.name ?? "–"}`,
		});
	}
	if (transfer.reversedAt) {
		events.push({
			key: "reversed",
			at: transfer.reversedAt,
			text: `Reversed by ${transfer.reversedBy?.name ?? "–"}`,
		});
	}
	events.sort((a, b) => a.at.localeCompare(b.at));

	const locationName = (id: number) =>
		id === transfer.source.id
			? transfer.source.name
			: id === transfer.destination.id
				? transfer.destination.name
				: `Location #${id}`;

	return (
		<Card>
			<CardHeader>
				<CardTitle>History</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<ol className="space-y-3 border-l pl-3 text-sm">
					{events.map((event) => (
						<li key={event.key}>
							<p>{event.text}</p>
							<p className="text-[13px] text-muted-foreground">
								{formatDateTime(event.at)}
							</p>
						</li>
					))}
				</ol>
				{transfer.ledgerRows.length > 0 ? (
					<div className="space-y-2">
						<h3 className="text-sm font-medium">Stock postings</h3>
						<ul className="space-y-2 text-sm">
							{transfer.ledgerRows.map((row) => (
								<li key={row.id} className="space-y-0.5">
									<p>
										{row.referenceType === "stock_transfer_reversal"
											? "Reversal"
											: "Transfer"}
										{" · "}
										{locationName(row.locationId)}
									</p>
									<p className="text-[13px] text-muted-foreground tabular-nums">
										{row.quantityChange > 0 ? "In " : "Out "}
										{transferQty(Math.abs(row.quantityChange), null)} at{" "}
										{formatMoney(row.unitCostPaise)} ={" "}
										{formatMoney(row.totalValueChangePaise)}
									</p>
								</li>
							))}
						</ul>
					</div>
				) : null}
				{transfer.status === "posted" || transfer.status === "reversed" ? (
					<div className="flex flex-col gap-1 text-sm">
						<Link
							href="/inventory/movements?referenceType=stock_transfer"
							className="text-brand-accent hover:underline"
						>
							View stock movements
						</Link>
						{transfer.status === "reversed" ? (
							<Link
								href="/inventory/movements?referenceType=stock_transfer_reversal"
								className="text-brand-accent hover:underline"
							>
								View reversal movements
							</Link>
						) : null}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
