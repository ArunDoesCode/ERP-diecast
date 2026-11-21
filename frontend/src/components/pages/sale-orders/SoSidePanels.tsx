"use client";

import Link from "next/link";
import { useState } from "react";

import { raisedDocHref } from "@/components/pages/sale-orders/so-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useSaleOrderAuditQuery,
	useSoExplosionsQuery,
} from "@/lib/api/sale-order/queries";
import { formatDateTime } from "@/lib/format";
import type { SoDetail } from "@/types/sale-order";

export function SoExplosionPanel({ so }: { so: SoDetail }) {
	const snapshot = so.currentSnapshot;
	const runs = useSoExplosionsQuery(
		so.id,
		{ page: 1, pageSize: 100, sortBy: "runNo", sortDir: "desc" },
		so.status !== "draft",
	);
	const older = (runs.data?.data ?? []).filter(
		(run) => run.status === "superseded",
	);
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Explosion</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-2 text-sm">
				{snapshot ? (
					<>
						<div className="flex flex-wrap items-center gap-2">
							<Link
								href={`/sale-orders/${so.id}/explosion`}
								className="font-mono text-brand-accent hover:underline"
							>
								{snapshot.number}
							</Link>
							<StatusBadge
								doc="soSnapshot"
								status={snapshot.outOfDate ? "out_of_date" : "current"}
							/>
						</div>
						<p className="text-[13px] text-muted-foreground">
							Run E{snapshot.runNo} · {formatDateTime(snapshot.createdAt)} ·{" "}
							{snapshot.rowCount} rows, {snapshot.flaggedCount} flagged
						</p>
						{snapshot.outOfDate ? (
							<p className="rounded-md bg-warning-subtle px-3 py-2 text-[13px] text-warning">
								Out of date: order or a BOM changed. Re-run before creating
								drafts.
							</p>
						) : null}
					</>
				) : (
					<p className="text-muted-foreground">Not exploded yet.</p>
				)}
				{runs.isLoading ? (
					<Skeleton className="h-4 w-32" />
				) : older.length > 0 ? (
					<ul className="flex flex-col gap-1 text-[13px]">
						{older.map((run) => (
							<li key={run.id} className="flex items-center gap-2">
								<Link
									href={`/sale-orders/${so.id}/explosion?run=E${run.runNo}`}
									className="font-mono text-brand-accent hover:underline"
								>
									E{run.runNo}
								</Link>
								<StatusBadge doc="soSnapshot" status="superseded" />
							</li>
						))}
					</ul>
				) : null}
			</CardContent>
		</Card>
	);
}

export function SoRaisedPanel({ so }: { so: SoDetail }) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Raised documents</CardTitle>
			</CardHeader>
			<CardContent className="text-sm">
				{so.raisedDocuments.length === 0 ? (
					<p className="text-muted-foreground">Nothing raised yet.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{so.raisedDocuments.map((doc) => (
							<li
								key={`${doc.type}-${doc.id}`}
								className="flex flex-wrap items-center gap-2"
							>
								<Link
									href={raisedDocHref(doc)}
									className="font-mono text-brand-accent hover:underline"
								>
									{doc.number}
								</Link>
								<span className="text-[13px] text-muted-foreground uppercase">
									{doc.type}
								</span>
								<StatusBadge doc={doc.type} status={doc.status} />
								<span className="text-[13px] text-muted-foreground">
									E{doc.runNo}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function describe(value: unknown) {
	if (value === null || value === undefined) return "–";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function SoActivityPanel({ soId }: { soId: number }) {
	const [showAll, setShowAll] = useState(false);
	const query = useSaleOrderAuditQuery(soId, {
		page: 1,
		pageSize: showAll ? 50 : 10,
		sortDir: "desc",
	});
	const rows = query.data?.data ?? [];
	const total = query.data?.meta.total ?? 0;
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Activity</CardTitle>
			</CardHeader>
			<CardContent className="text-sm">
				{query.isLoading ? (
					<Skeleton className="h-16" />
				) : query.isError ? (
					<p className="text-muted-foreground">Activity could not be loaded.</p>
				) : rows.length === 0 ? (
					<p className="text-muted-foreground">No activity yet.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{rows.map((row) => (
							<li key={row.id} className="flex flex-col text-[13px]">
								<span>
									<span className="font-semibold">{row.action}</span> ·{" "}
									{row.actorName ?? "System"} · {formatDateTime(row.at)}
								</span>
								{row.before !== null || row.after !== null ? (
									<span className="break-words text-muted-foreground">
										{describe(row.before)} → {describe(row.after)}
									</span>
								) : null}
							</li>
						))}
					</ul>
				)}
				{!showAll && total > 10 ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="mt-2"
						onClick={() => setShowAll(true)}
					>
						Show all
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}
