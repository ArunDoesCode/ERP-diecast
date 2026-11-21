import Link from "next/link";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BomListRow } from "@/types/bom";

export function BomRevisionsPanel({
	revisions,
	selectedId,
}: {
	revisions: BomListRow[];
	selectedId: number | undefined;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Revisions</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="flex flex-col gap-1 text-sm">
					{revisions.map((rev) => {
						const selected = rev.id === selectedId;
						return (
							<li key={rev.id}>
								<Link
									href={`/bom/part/${rev.partId}?rev=${rev.revision}`}
									aria-current={selected ? "true" : undefined}
									className={cn(
										"flex items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted",
										selected ? "border-brand-accent" : "border-transparent",
									)}
								>
									<span className="font-mono">{rev.number}</span>
									<StatusBadge doc="bom" status={rev.status} />
									<span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
										{formatDate(rev.releasedAt)}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}
