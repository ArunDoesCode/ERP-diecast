import { StatusBadge } from "@/components/shared/StatusBadge";
import type { Rating, RatingLabel, TrendMonth } from "@/types/supplier-rating";

type RatingLabelSource = Pick<Rating, "label" | "notEnoughData"> | TrendMonth;

/** Score label badge: Good / Watch / Poor, "Not enough data", or "No data" (BR-SRT-22, 23). */
export function RatingLabelBadge({ rating }: { rating: RatingLabelSource }) {
	return <StatusBadge doc="supplierRating" status={ratingStatusKey(rating)} />;
}

export function ratingStatusKey(rating: RatingLabelSource): string {
	if (rating.notEnoughData) return "not_enough_data";
	const label: RatingLabel | null = rating.label;
	return label ?? "no_data";
}
