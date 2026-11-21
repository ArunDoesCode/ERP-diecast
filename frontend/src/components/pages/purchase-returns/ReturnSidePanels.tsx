import Link from "next/link";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { PrtDetail, PrtEvent } from "@/types/purchase-return";

const ACTION_LABEL: Record<PrtEvent["action"], string> = {
	create: "Created",
	edit: "Edited",
	post: "Posted",
	cancel_draft: "Draft cancelled",
	cancel_posted: "Return cancelled",
};

const STATUS_LABEL = {
	draft: "Draft",
	posted: "Posted",
	cancelled: "Cancelled",
} as const;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right">{value}</dd>
		</div>
	);
}

export function ReturnFactsCard({ prt }: { prt: PrtDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Facts</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="space-y-1.5 text-sm">
					<Fact label="RMA ref" value={prt.vendorReturnRef || "–"} />
					<Fact label="Transporter" value={prt.transporter || "–"} />
					<Fact label="Vehicle no." value={prt.vehicleNo || "–"} />
					<Fact
						label="Replacement expected"
						value={prt.replacementExpected ? "Yes" : "No"}
					/>
					<Fact label="Remarks" value={prt.remarks || "–"} />
					<Fact label="Supplier challan" value={prt.grnChallanNo || "–"} />
				</dl>
			</CardContent>
		</Card>
	);
}

export function ReturnDebitNoteCard({ prt }: { prt: PrtDetail }) {
	const note = prt.debitNote;
	if (!note) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Debit note</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="space-y-1.5 text-sm">
					<Fact
						label="Debit note no."
						value={
							<Link
								href={`/purchase-returns/${prt.id}/debit-note`}
								className="font-mono text-brand-accent hover:underline"
							>
								{note.dnNumber}
							</Link>
						}
					/>
					<Fact
						label="Challan no."
						value={
							prt.challanNumber ? (
								<Link
									href={`/purchase-returns/${prt.id}/challan`}
									className="font-mono text-brand-accent hover:underline"
								>
									{prt.challanNumber}
								</Link>
							) : (
								"–"
							)
						}
					/>
					<Fact label="Date" value={formatDate(note.debitNoteDate)} />
					<Fact
						label="Status"
						value={<StatusBadge doc="debitNote" status={note.status} />}
					/>
					<Fact label="Total" value={formatMoney(note.totalPaise)} />
					<Fact
						label="Supplier bill"
						value={
							note.supplierBill
								? `${note.supplierBill.invoiceNumber} (${formatDate(note.supplierBill.invoiceDate)})`
								: "None linked"
						}
					/>
				</dl>
			</CardContent>
		</Card>
	);
}

export function ReturnActivityCard({ prt }: { prt: PrtDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Activity</CardTitle>
			</CardHeader>
			<CardContent>
				{prt.events.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nothing yet.</p>
				) : (
					<ol className="space-y-3 border-l pl-3 text-sm">
						{prt.events.map((event) => (
							<li key={event.id} className="space-y-0.5">
								<p className="font-medium">
									{ACTION_LABEL[event.action] ?? event.action}
									<span className="font-normal text-muted-foreground">
										{" "}
										by {event.actorName ?? `user ${event.actorId}`}
									</span>
								</p>
								<p className="text-[13px] text-muted-foreground">
									{formatDateTime(event.at)}
									{event.fromStatus
										? ` · ${STATUS_LABEL[event.fromStatus]} → ${STATUS_LABEL[event.toStatus]}`
										: ""}
								</p>
								{event.reason ? (
									<p className="text-[13px]">Reason: {event.reason}</p>
								) : null}
							</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}
