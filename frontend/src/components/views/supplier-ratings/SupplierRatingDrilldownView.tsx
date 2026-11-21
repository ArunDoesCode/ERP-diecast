"use client";

import { IconStarHalf } from "@tabler/icons-react";
import Link from "next/link";

import { RatingLabelBadge } from "@/components/pages/supplier-rating/RatingLabelBadge";
import { RatingLinesTable } from "@/components/pages/supplier-rating/RatingLinesTable";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { Pagination } from "@/components/shared/Pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	MEASURES,
	useRatingDrilldownControls,
	VERDICT_QUICK,
} from "@/components/views/supplier-ratings/use-rating-drilldown-controls";
import { useCan } from "@/hooks/use-can";
import {
	ratingErrorStatus,
	useRatingCardQuery,
	useRatingLinesQuery,
} from "@/lib/api/supplier-rating/queries";
import { formatDate, formatPercentTenths } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type {
	OnTimeLine,
	PriceLine,
	Rating,
	RatingMeasure,
	RejectionLine,
} from "@/types/supplier-rating";

const MEASURE_LABEL: Record<RatingMeasure, string> = {
	on_time: "On-time",
	rejection: "Rejection",
	price: "Price variance",
};

function measureValue(rating: Rating, measure: RatingMeasure) {
	if (measure === "on_time")
		return formatPercentTenths(rating.onTime.pctTenths);
	if (measure === "rejection") {
		return formatPercentTenths(rating.rejection.pctTenths);
	}
	return formatPercentTenths(rating.priceVariance.pctTenths, { signed: true });
}

/** Line count sentence above the table: the basis of the number (BR-SRT-27). */
function basisText(rating: Rating, measure: RatingMeasure): string {
	if (measure === "on_time") {
		const o = rating.onTime;
		const parts = [`${o.lines} lines judged`, `${o.lateLines} late`];
		if (o.noDueDateCount > 0) {
			parts.push(`${o.noDueDateCount} with no due date`);
		}
		return parts.join(", ");
	}
	if (measure === "rejection") {
		const r = rating.rejection;
		return `${r.decidedLines} lines inspected, ${r.linesWithRejects} with rejects, ${r.notInspectedLines} not inspected`;
	}
	const p = rating.priceVariance;
	return `${p.comparedLines} lines compared to a reference rate, ${p.notComparedLines} not compared`;
}

export function SupplierRatingDrilldownView({
	supplierId,
}: {
	supplierId: number;
}) {
	const canView = useCan("supplier.rating.view");
	const c = useRatingDrilldownControls();
	const cardQuery = useRatingCardQuery(supplierId, canView);
	const linesQuery = useRatingLinesQuery<
		OnTimeLine | RejectionLine | PriceLine
	>(
		supplierId,
		{
			measure: c.measure,
			page: c.page,
			pageSize: c.pageSize,
			sortBy: c.sortBy,
			sortDir: c.sortDir,
			verdict: c.measure === "on_time" ? c.verdict : undefined,
		},
		canView,
	);

	const rating = cardQuery.data?.data;
	useBreadcrumbLast(rating?.supplierName);

	if (!canView) return <NoAccessState what="supplier ratings" />;
	const status =
		ratingErrorStatus(cardQuery.error) ?? ratingErrorStatus(linesQuery.error);
	if (status === 403) return <NoAccessState what="supplier ratings" />;
	if (status === 404) {
		return (
			<div className="flex flex-col gap-4">
				<EmptyState
					icon={IconStarHalf}
					title="Supplier not found"
					action={
						<Link
							href="/supplier-ratings"
							className="text-sm font-medium text-brand-accent hover:underline"
						>
							Back to Supplier rating
						</Link>
					}
				/>
			</div>
		);
	}

	const meta = linesQuery.data?.meta;
	const rows = linesQuery.data?.data ?? [];

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={rating?.supplierName ?? `Supplier #${supplierId}`}
				docNoPlain
				status={rating ? <RatingLabelBadge rating={rating} /> : null}
				backHref="/supplier-ratings"
				backLabel="Supplier rating"
				loading={cardQuery.isLoading}
			/>

			<div className="grid grid-cols-1 gap-4 min-[1025px]:grid-cols-[280px_minmax(0,1fr)]">
				<Card className="h-fit">
					<CardContent className="flex flex-col gap-4">
						{cardQuery.isLoading ? (
							<div className="flex flex-col gap-2" aria-busy="true">
								<Skeleton className="h-8 w-24" />
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
							</div>
						) : cardQuery.isError || !rating ? (
							<ErrorState
								message="Failed to load the rating."
								onRetry={() => {
									void cardQuery.refetch();
								}}
								retrying={cardQuery.isRefetching}
							/>
						) : (
							<>
								<div className="flex flex-col gap-1">
									<span className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
										Score
									</span>
									<span className="text-3xl leading-9 font-bold tabular-nums">
										{rating.notEnoughData ? "–" : (rating.score ?? "–")}
									</span>
									{rating.notEnoughData ? (
										<span className="text-[13px] text-muted-foreground">
											Not enough data: {rating.notEnoughData.judgedLines} judged
											and {rating.notEnoughData.decidedLines} inspected lines,{" "}
											{rating.notEnoughData.required} of each needed.
										</span>
									) : null}
								</div>
								<ToggleGroup
									type="single"
									variant="outline"
									orientation="vertical"
									spacing={1}
									aria-label="Measure"
									value={c.measure}
									onValueChange={(next) => {
										if (next) c.onMeasureChange(next as RatingMeasure);
									}}
									className="w-full"
								>
									{MEASURES.map((m) => (
										<ToggleGroupItem
											key={m}
											value={m}
											className="h-auto justify-between px-3 py-2 data-[state=on]:border-brand-accent"
										>
											<span>{MEASURE_LABEL[m]}</span>
											<span className="tabular-nums">
												{measureValue(rating, m)}
											</span>
										</ToggleGroupItem>
									))}
								</ToggleGroup>
								<p className="text-[13px] leading-[18px] text-muted-foreground">
									Window {formatDate(rating.windowFrom)} to{" "}
									{formatDate(rating.windowTo)}
								</p>
							</>
						)}
					</CardContent>
				</Card>

				<div className="flex min-w-0 flex-col gap-3">
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-semibold">
							{MEASURE_LABEL[c.measure]}
						</h2>
						<p className="text-sm text-muted-foreground">
							{rating
								? basisText(rating, c.measure)
								: meta
									? `${meta.total} lines`
									: " "}
						</p>
					</div>
					{c.measure === "on_time" ? (
						<FilterBar
							quick={VERDICT_QUICK}
							value={c.verdict}
							onChange={c.onVerdictChange}
						/>
					) : null}
					<RatingLinesTable
						measure={c.measure}
						rows={rows}
						isLoading={linesQuery.isLoading}
						isError={linesQuery.isError}
						onRetry={() => {
							void linesQuery.refetch();
						}}
						retrying={linesQuery.isRefetching}
						sortBy={c.sortBy}
						sortDir={c.sortDir}
						onSortChange={c.onSortChange}
					/>
					<Pagination
						page={c.page}
						pageSize={c.pageSize}
						total={meta?.total ?? 0}
						onPageChange={c.setPage}
						onPageSizeChange={c.onPageSizeChange}
					/>
				</div>
			</div>
		</div>
	);
}
