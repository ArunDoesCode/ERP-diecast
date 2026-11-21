"use client";

import { IconStarHalf } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { RatingLabelBadge } from "@/components/pages/supplier-rating/RatingLabelBadge";
import { RatingTrendTable } from "@/components/pages/supplier-rating/RatingTrendTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useRatingCardQuery,
	useRatingTrendQuery,
} from "@/lib/api/supplier-rating/queries";
import { formatDate, formatPercentTenths, formatQtyTrim } from "@/lib/format";
import type { Rating, RatingMeasure } from "@/types/supplier-rating";

function drillHref(supplierId: number, measure: RatingMeasure) {
	return `/supplier-ratings/${supplierId}?measure=${measure}`;
}

function Tile({
	href,
	title,
	value,
	children,
}: {
	href: string;
	title: string;
	value: string;
	children: ReactNode;
}) {
	return (
		<Link
			href={href}
			className="flex flex-col gap-1 rounded-md border border-border p-3 hover:bg-muted"
		>
			<span className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
				{title}
			</span>
			<span className="text-xl leading-7 font-bold tabular-nums">{value}</span>
			<span className="flex flex-col text-[13px] leading-[18px] text-muted-foreground">
				{children}
			</span>
		</Link>
	);
}

function plural(n: number, one: string, many = `${one}s`) {
	return `${n} ${n === 1 ? one : many}`;
}

export function RatingMeasureTiles({ rating }: { rating: Rating }) {
	const { onTime, rejection, priceVariance } = rating;
	const id = rating.supplierId;
	return (
		<div className="grid gap-3 sm:grid-cols-3">
			<Tile
				href={drillHref(id, "on_time")}
				title="On-time"
				value={formatPercentTenths(onTime.pctTenths)}
			>
				<span>
					{onTime.onTimeLines} of {plural(onTime.lines, "line")} on time
				</span>
				<span>{onTime.lateLines} late</span>
				{onTime.shortClosedLateCount > 0 ? (
					<span>{onTime.shortClosedLateCount} short-closed, judged late</span>
				) : null}
				{onTime.cancelledAfterDispatchCount > 0 ? (
					<span>
						{onTime.cancelledAfterDispatchCount} cancelled after dispatch
					</span>
				) : null}
				{onTime.noDueDateCount > 0 ? (
					<span>{plural(onTime.noDueDateCount, "line")} with no due date</span>
				) : null}
			</Tile>
			<Tile
				href={drillHref(id, "rejection")}
				title="Rejection"
				value={formatPercentTenths(rejection.pctTenths)}
			>
				<span>
					{rejection.linesWithRejects} of{" "}
					{plural(rejection.decidedLines, "line")} had rejects
				</span>
				{rejection.notInspectedLines > 0 ? (
					<span>
						{rejection.notInspectedLines} not inspected
						{rejection.notInspectedRejectedQty.length > 0
							? `, ${rejection.notInspectedRejectedQty
									.map((q) => formatQtyTrim(q.qty, q.uom))
									.join(", ")} rejected`
							: ""}
					</span>
				) : null}
			</Tile>
			<Tile
				href={drillHref(id, "price")}
				title="Price variance"
				value={formatPercentTenths(priceVariance.pctTenths, { signed: true })}
			>
				<span>
					{priceVariance.comparedLines} of {plural(priceVariance.lines, "line")}{" "}
					compared to reference rate
				</span>
				{priceVariance.notComparedLines > 0 ? (
					<span>{priceVariance.notComparedLines} not compared</span>
				) : null}
			</Tile>
		</div>
	);
}

function Headline({ rating }: { rating: Rating }) {
	const nd = rating.notEnoughData;
	if (nd) {
		return (
			<div className="flex flex-col gap-1">
				<RatingLabelBadge rating={rating} />
				<p className="text-[13px] text-muted-foreground">
					{nd.judgedLines} judged on-time lines and {nd.decidedLines} inspected
					lines; {nd.required} of each needed for a score.
				</p>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-2">
			<span className="text-3xl leading-9 font-bold tabular-nums">
				{rating.score ?? "–"}
			</span>
			<RatingLabelBadge rating={rating} />
		</div>
	);
}

const noRatedLines = (r: Rating) =>
	r.onTime.lines === 0 &&
	r.rejection.decidedLines === 0 &&
	r.rejection.notInspectedLines === 0 &&
	r.priceVariance.lines === 0;

/** Rating card + 12-month trend on the supplier page. Two requests; each fails on its own (BR-SRT-28). */
export function RatingCard({ supplierId }: { supplierId: number }) {
	const cardQuery = useRatingCardQuery(supplierId);
	const trendQuery = useRatingTrendQuery(supplierId);
	const rating = cardQuery.data?.data;

	return (
		<Card>
			<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
				<div className="flex flex-col gap-1">
					<CardTitle>Rating</CardTitle>
					<p className="text-sm text-muted-foreground">
						{rating
							? `Last 12 months, ${formatDate(rating.windowFrom)} to ${formatDate(rating.windowTo)}`
							: "Last 12 months"}
					</p>
				</div>
				{rating ? (
					<Button asChild variant="outline" size="sm">
						<Link href={drillHref(supplierId, "on_time")}>See lines</Link>
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{cardQuery.isLoading ? (
					<div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
						<Skeleton className="h-24 w-full" />
						<Skeleton className="h-24 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>
				) : cardQuery.isError || !rating ? (
					<ErrorState
						message="Failed to load the rating."
						onRetry={() => {
							void cardQuery.refetch();
						}}
						retrying={cardQuery.isRefetching}
					/>
				) : noRatedLines(rating) ? (
					<EmptyState
						icon={IconStarHalf}
						title="No rated deliveries in the last 12 months"
					/>
				) : (
					<>
						<Headline rating={rating} />
						<RatingMeasureTiles rating={rating} />
					</>
				)}
				<RatingTrendTable
					months={trendQuery.data?.data.months}
					isLoading={trendQuery.isLoading}
					isError={trendQuery.isError}
					onRetry={() => {
						void trendQuery.refetch();
					}}
					retrying={trendQuery.isRefetching}
				/>
			</CardContent>
		</Card>
	);
}
