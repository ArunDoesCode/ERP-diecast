import Link from "next/link";

import { startedByText } from "@/components/pages/reorder/reorder-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { ReorderRunDetail } from "@/types/reorder";

function Pair({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex gap-2">
			<dt className="w-28 shrink-0 font-semibold text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 tabular-nums">{children}</dd>
		</div>
	);
}

export function ReorderRunFactsCard({
	run,
	canOpenPr,
}: {
	run: ReorderRunDetail;
	canOpenPr: boolean;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Result</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="flex flex-col gap-1.5 text-[13px]">
					<Pair label="Started">{formatDateTime(run.startedAt)}</Pair>
					<Pair label="Finished">{formatDateTime(run.finishedAt)}</Pair>
					<Pair label="Started by">{startedByText(run)}</Pair>
					<Pair label="Draft owner">{run.draftOwner?.name ?? "–"}</Pair>
					<Pair label="Checked">{run.itemsChecked}</Pair>
					<Pair label="Raised">{run.itemsRaised}</Pair>
					<Pair label="Skipped">
						{run.itemsSkipped}
						<span className="ml-3 text-muted-foreground">
							Deferred {run.itemsDeferred}
						</span>
					</Pair>
					<Pair label="PR raised">
						{run.pr ? (
							<span className="flex flex-wrap items-center gap-2">
								{canOpenPr ? (
									<Link
										href={`/purchase-requisitions/${run.pr.id}`}
										className="font-mono text-brand-accent hover:underline"
									>
										{run.pr.prNumber}
									</Link>
								) : (
									<span className="font-mono">{run.pr.prNumber}</span>
								)}
								<StatusBadge doc="pr" status={run.pr.status} />
							</span>
						) : (
							"–"
						)}
					</Pair>
					{run.state === "failed" ? (
						<Pair label="Failure">
							<span className="text-destructive">
								{run.failureReason ?? "The check failed."}
							</span>
						</Pair>
					) : null}
				</dl>
			</CardContent>
		</Card>
	);
}
