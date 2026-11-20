"use client";

import Link from "next/link";
import { useState } from "react";

import { ErrorState } from "@/components/shared/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bomErrorMessage, useBomWhereUsedQuery } from "@/lib/api/bom/queries";
import type { BomWhereUsedRole } from "@/types/bom";
import { BomMiniPager } from "./BomMiniPager";
import { formatBomQty } from "./bom-format";

const ROLE_LABELS: Record<BomWhereUsedRole, string> = {
	line: "Line",
	sent_item: "Sent item",
	alloy: "Alloy",
};

export function BomUsedInPanel({
	itemId,
	unit,
}: {
	itemId: number;
	unit: string;
}) {
	const [page, setPage] = useState(1);
	const query = useBomWhereUsedQuery(itemId, {
		page,
		pageSize: 10,
		sortBy: "partSku",
		sortDir: "asc",
	});
	const rows = query.data?.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Used in</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<Skeleton className="h-16" />
				) : query.isError ? (
					<ErrorState
						message={bomErrorMessage(
							query.error,
							"Could not load where this is used.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Not used in any active BOM.
					</p>
				) : (
					<>
						<ul className="flex flex-col gap-2 text-sm">
							{rows.map((row) => (
								<li
									key={`${row.bomId}-${row.role}`}
									className="flex flex-wrap items-center gap-x-2 border-b pb-2 last:border-b-0"
								>
									<Link
										href={`/bom/part/${row.partId}?rev=${row.revision}`}
										className="font-mono text-brand-accent hover:underline"
									>
										{row.number}
									</Link>
									<span>{row.partSku}</span>
									<span className="text-muted-foreground">
										{ROLE_LABELS[row.role]}
									</span>
									<span className="ml-auto tabular-nums">
										{formatBomQty(row.qtyPerPiece, unit)}
										{row.buyAsIs ? " · Buy as is" : ""}
									</span>
								</li>
							))}
						</ul>
						<BomMiniPager
							page={page}
							totalPages={query.data?.meta.totalPages ?? 1}
							onPageChange={setPage}
						/>
					</>
				)}
			</CardContent>
		</Card>
	);
}
