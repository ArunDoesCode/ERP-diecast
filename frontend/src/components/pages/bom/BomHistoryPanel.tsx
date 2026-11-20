"use client";

import { useState } from "react";

import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bomErrorMessage, useBomHistoryQuery } from "@/lib/api/bom/queries";
import { formatDateTime } from "@/lib/format";
import type { BomHistoryAction } from "@/types/bom";
import { BomMiniPager } from "./BomMiniPager";

const ACTION_LABELS: Record<BomHistoryAction, string> = {
	create: "Created",
	edit: "Edited",
	delete: "Deleted",
	release: "Released",
	retire: "Retired",
};

const PAGE_SIZE = 20;

export function BomHistoryPanel({ partId }: { partId: number }) {
	const [showAll, setShowAll] = useState(false);
	const [page, setPage] = useState(1);
	const query = useBomHistoryQuery(partId, {
		page,
		pageSize: PAGE_SIZE,
		sortBy: "changedAt",
		sortDir: "desc",
	});
	const rows = query.data?.data ?? [];
	const totalPages = query.data?.meta.totalPages ?? 1;

	return (
		<Card>
			<CardHeader>
				<CardTitle>History</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<Skeleton className="h-16" />
				) : query.isError ? (
					<ErrorState
						message={bomErrorMessage(
							query.error,
							"History could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">No history yet</p>
				) : (
					<>
						<ul className="flex flex-col gap-2 text-sm">
							{rows.map((row) => (
								<li key={row.id} className="border-b pb-2 last:border-b-0">
									<p>
										<span className="font-medium">
											{ACTION_LABELS[row.action]}
										</span>{" "}
										rev {row.revision} by {row.changedBy.name}
									</p>
									<p className="text-[13px] text-muted-foreground tabular-nums">
										{formatDateTime(row.changedAt)}
									</p>
									{row.reason ? (
										<p className="text-[13px]">{row.reason}</p>
									) : null}
								</li>
							))}
						</ul>
						{showAll ? (
							<BomMiniPager
								page={page}
								totalPages={totalPages}
								onPageChange={setPage}
							/>
						) : totalPages > 1 ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="mt-2"
								onClick={() => setShowAll(true)}
							>
								Show all
							</Button>
						) : null}
					</>
				)}
			</CardContent>
		</Card>
	);
}
