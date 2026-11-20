import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ReceivablePo } from "@/lib/api/grn/receivable-types";
import { formatDate, formatDocNo, formatQty } from "@/lib/format";

function daysBetween(fromIso: string, toIso: string) {
	const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
	const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
	return Math.round((to - from) / 86_400_000);
}

export function DueMark({
	dueDate,
	isLate,
	today,
}: {
	dueDate: string | null;
	isLate: boolean;
	today: string | undefined;
}) {
	if (!dueDate)
		return <span className="text-muted-foreground">No due date</span>;
	if (isLate) {
		const days = today ? daysBetween(dueDate, today) : 0;
		return (
			<span className="font-semibold text-destructive">
				{formatDate(dueDate)}
				{days > 0
					? ` · ${days} ${days === 1 ? "day" : "days"} late`
					: " · late"}
			</span>
		);
	}
	if (today && dueDate.slice(0, 10) === today.slice(0, 10)) {
		return (
			<span className="font-semibold text-warning">
				{formatDate(dueDate)} · due today
			</span>
		);
	}
	return <span>{formatDate(dueDate)}</span>;
}

export function ReceivePickerRow({
	po,
	today,
}: {
	po: ReceivablePo;
	today: string | undefined;
}) {
	const href = `/grn/new?po=${po.poId}`;
	return (
		<li className="flex min-h-11 flex-col gap-2 border-b px-3 py-2 last:border-b-0 md:flex-row md:items-center md:gap-4">
			<div className="min-w-0 md:w-56">
				<Link
					href={href}
					className="font-mono text-brand-accent hover:underline"
				>
					{formatDocNo(po.poNumber)}
				</Link>
				<p className="truncate text-sm text-muted-foreground">
					{po.supplierName ?? "–"}
				</p>
			</div>
			<div className="text-sm md:w-52">
				<DueMark dueDate={po.dueDate} isLate={po.isLate} today={today} />
			</div>
			<ul className="min-w-0 flex-1 space-y-0.5 text-sm">
				{po.lines.map((line) => (
					<li key={line.poItemId} className="truncate">
						<span className="text-muted-foreground">Waiting for </span>
						<span className="font-medium">{line.itemName ?? "–"}</span>
						<span className="text-muted-foreground">
							{" · "}
							{formatQty(line.openQty, line.uom, 3)} open
						</span>
					</li>
				))}
			</ul>
			<Button asChild size="lg">
				<Link href={href}>Receive</Link>
			</Button>
		</li>
	);
}
