"use client";

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
	usePoCommunicationsQuery,
	usePurchaseOrderDetailQuery,
} from "@/lib/api/purchase-orders/queries";
import type { PoCommunicationType } from "@/types/purchase-orders";

const COMM_TYPE_LABEL: Record<PoCommunicationType, string> = {
	po_sent: "PO sent",
	reminder: "Reminder",
	escalation: "Escalation",
};

function money(paise?: number | null) {
	return `₹${((paise ?? 0) / 100).toLocaleString("en-IN", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function dateTime(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

/** PO lines with GST, totals (BR-PO-04) and the communications log (BR-PO-17). */
export function PoDetailPanel({ poId }: { poId: number }) {
	const detailQuery = usePurchaseOrderDetailQuery(poId, true);
	const commsQuery = usePoCommunicationsQuery(poId, true);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const comms = commsQuery.data?.success ? commsQuery.data.data : [];

	if (detailQuery.isLoading) return <Skeleton className="h-24 w-full" />;
	if (!detail) {
		return (
			<p className="text-xs text-destructive">Could not load the PO details.</p>
		);
	}
	const { po, items } = detail;

	return (
		<div className="space-y-4 rounded-md border p-3 text-xs">
			<div className="grid gap-1 text-muted-foreground sm:grid-cols-3">
				<span>
					Payment terms:{" "}
					{po.paymentTermsDays != null ? `${po.paymentTermsDays} days` : "-"}
				</span>
				<span>Expected delivery: {po.expectedDeliveryDate ?? "-"}</span>
				<span>Delivery terms: {po.deliveryTerms ?? "-"}</span>
				{po.status === "cancelled" && po.cancelReason ? (
					<span className="sm:col-span-3">
						Cancelled{po.cancelledByName ? ` by ${po.cancelledByName}` : ""}:{" "}
						{po.cancelReason}
					</span>
				) : null}
				{po.shortClosed ? (
					<span className="sm:col-span-3">
						Short-closed (rest not received)
					</span>
				) : null}
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Item</TableHead>
						<TableHead>Qty</TableHead>
						<TableHead>Rate</TableHead>
						<TableHead>GST %</TableHead>
						<TableHead className="text-right">Value</TableHead>
						<TableHead className="text-right">GST</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell>{item.itemName ?? `Item ${item.itemId}`}</TableCell>
							<TableCell>
								{item.qty} {item.uom ?? ""}
							</TableCell>
							<TableCell>{money(item.unitPricePaise)}</TableCell>
							<TableCell>{item.gstPercent ?? 0}%</TableCell>
							<TableCell className="text-right">
								{money(
									item.lineValuePaise ??
										Math.round(item.qty * item.unitPricePaise),
								)}
							</TableCell>
							<TableCell className="text-right">
								{money(item.lineTaxPaise)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			<dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-right">
				<dt className="text-muted-foreground">Subtotal</dt>
				<dd>{money(po.subtotalPaise)}</dd>
				<dt className="text-muted-foreground">GST</dt>
				<dd>{money(po.taxAmountPaise)}</dd>
				<dt className="font-medium">Total</dt>
				<dd className="font-medium">{money(po.totalAmountPaise)}</dd>
			</dl>

			<section aria-label="Communications log" className="space-y-1">
				<h4 className="font-medium">Communications</h4>
				{commsQuery.isLoading ? (
					<Skeleton className="h-8 w-full" />
				) : comms.length === 0 ? (
					<p className="text-muted-foreground">Nothing logged yet.</p>
				) : (
					<ul className="space-y-1 border-l pl-3">
						{comms.map((row) => (
							<li key={row.id}>
								<span className="font-medium">
									{COMM_TYPE_LABEL[row.type] ?? row.type}
								</span>{" "}
								via {row.channel.replace("_", " ")} · {dateTime(row.sentAt)}
								{row.note ? (
									<p className="text-muted-foreground">“{row.note}”</p>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
