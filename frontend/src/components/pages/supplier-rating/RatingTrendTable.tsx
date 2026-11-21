import { RatingLabelBadge } from "@/components/pages/supplier-rating/RatingLabelBadge";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, formatPercentTenths } from "@/lib/format";
import type { TrendMeasure, TrendMonth } from "@/types/supplier-rating";

type Props = {
	months: TrendMonth[] | undefined;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	retrying: boolean;
};

/** Month label from `YYYY-MM`: `Nov 2026`. */
function monthLabel(month: string) {
	return formatDate(`${month}-15`).replace(/^\d+ /, "");
}

function MeasureCell({
	measure,
	signed,
}: {
	measure: TrendMeasure;
	signed?: boolean;
}) {
	if (measure.pctTenths === null) {
		return <span className="text-muted-foreground">No data</span>;
	}
	return (
		<span>
			{formatPercentTenths(measure.pctTenths, { signed })} ({measure.lines})
		</span>
	);
}

const HEAD = ["Month", "Score", "Label", "On-time", "Rejection", "Price var."];

/** 12-month table, newest first; counts in brackets are the lines behind each value (BR-SRT-28). */
export function RatingTrendTable({
	months,
	isLoading,
	isError,
	onRetry,
	retrying,
}: Props) {
	if (isError) {
		return (
			<ErrorState
				message="Failed to load the 12-month trend."
				onRetry={onRetry}
				retrying={retrying}
			/>
		);
	}
	const rows = months ? [...months].reverse() : [];
	return (
		<div className="flex flex-col gap-2">
			<h2 className="text-sm font-semibold">Last 12 months by month</h2>
			<Table aria-busy={isLoading ? true : undefined}>
				<TableHeader>
					<TableRow>
						{HEAD.map((h, i) => (
							<TableHead
								key={h}
								scope="col"
								className={i === 1 ? "text-right" : undefined}
							>
								{h}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading
						? Array.from({ length: 12 }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton rows
								<TableRow key={`trend-skeleton-${i}`}>
									{HEAD.map((h) => (
										<TableCell key={h}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						: rows.map((m) => (
								<TableRow key={m.month}>
									<TableCell>{monthLabel(m.month)}</TableCell>
									<TableCell className="text-right tabular-nums">
										{m.score === null
											? "–"
											: `${m.score} (${m.onTime.lines + m.rejection.lines})`}
									</TableCell>
									<TableCell>
										{m.label === null ? "–" : <RatingLabelBadge rating={m} />}
									</TableCell>
									<TableCell className="tabular-nums">
										<MeasureCell measure={m.onTime} />
									</TableCell>
									<TableCell className="tabular-nums">
										<MeasureCell measure={m.rejection} />
									</TableCell>
									<TableCell className="tabular-nums">
										<MeasureCell measure={m.priceVariance} signed />
									</TableCell>
								</TableRow>
							))}
				</TableBody>
			</Table>
			<p className="text-[13px] text-muted-foreground">
				Numbers in brackets are the lines judged in that month.
			</p>
		</div>
	);
}
