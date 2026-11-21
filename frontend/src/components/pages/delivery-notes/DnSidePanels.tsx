import Link from "next/link";

import { activityLabel } from "@/components/pages/delivery-notes/dn-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { DnDetail } from "@/types/delivery-note";

/** SO number: an accent link with `so.view`, a plain mono label without. */
export function SoNumberLink({
	soId,
	soNumber,
	canView,
}: {
	soId: number;
	soNumber: string;
	canView: boolean;
}) {
	return canView ? (
		<Link
			href={`/sale-orders/${soId}`}
			className="font-mono text-brand-accent hover:underline"
		>
			{soNumber}
		</Link>
	) : (
		<span className="font-mono">{soNumber}</span>
	);
}

export function DnCustomerCard({
	note,
	canViewSo,
}: {
	note: DnDetail;
	canViewSo: boolean;
}) {
	const same =
		note.shipTo.address === note.customer.address &&
		note.shipTo.stateCode === note.customer.stateCode;
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Customer and ship-to</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1 text-sm">
				<p className="font-medium">{note.customer.name}</p>
				<p>{note.customer.address}</p>
				<p className="text-muted-foreground">
					State {note.customer.stateCode} ·{" "}
					{note.customer.gstin
						? `GSTIN ${note.customer.gstin}`
						: "Unregistered"}
				</p>
				<p>
					<span className="text-muted-foreground">Ship-to: </span>
					{same
						? "Same as customer"
						: `${note.shipTo.address} (state ${note.shipTo.stateCode})`}
				</p>
				<p>
					<SoNumberLink
						soId={note.soId}
						soNumber={note.soNumber}
						canView={canViewSo}
					/>
					<span className="text-muted-foreground">
						{" "}
						· Customer PO {note.customerPoNumber ?? "–"}
					</span>
				</p>
			</CardContent>
		</Card>
	);
}

export function DnStockCard({ note }: { note: DnDetail }) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Stock</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1 text-sm">
				<p>
					{note.status === "draft" ? "Ships from" : "Shipped from"}{" "}
					{note.sourceLocation.name}
				</p>
				<p className="text-muted-foreground">
					{note.status === "posted"
						? `Stock posted for ${note.lines.length} ${note.lines.length === 1 ? "line" : "lines"}`
						: note.status === "cancelled" && note.postedAt
							? "Stock was posted and put back on cancel"
							: "No stock has moved yet"}
				</p>
			</CardContent>
		</Card>
	);
}

export function DnActivityCard({ note }: { note: DnDetail }) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Activity</CardTitle>
			</CardHeader>
			<CardContent>
				{note.activity.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nothing yet.</p>
				) : (
					<ol className="space-y-3 border-l pl-3 text-sm">
						{note.activity.map((entry) => (
							<li key={`${entry.at}-${entry.action}`} className="space-y-0.5">
								<p className="font-medium">
									{activityLabel(entry.action)}
									<span className="font-normal text-muted-foreground">
										{" "}
										by {entry.actorName ?? "unknown"}
									</span>
								</p>
								<p className="text-[13px] text-muted-foreground">
									{formatDateTime(entry.at)}
								</p>
								{entry.reason ? (
									<p className="text-[13px]">Reason: {entry.reason}</p>
								) : null}
							</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}
