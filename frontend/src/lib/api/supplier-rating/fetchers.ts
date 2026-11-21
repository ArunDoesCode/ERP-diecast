import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	OnTimeLine,
	PriceLine,
	RatingCardResponse,
	RatingLinesParams,
	RatingLinesResponse,
	RatingListParams,
	RatingListResponse,
	RatingTrendResponse,
	RejectionLine,
} from "@/types/supplier-rating";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getRatingList(params?: RatingListParams) {
	return api.get<RatingListResponse>(
		`${API_ROUTES.supplierRating.list}${toQueryString(params)}`,
	);
}

export function getRatingCard(supplierId: number) {
	return api.get<RatingCardResponse>(
		API_ROUTES.supplierRating.card(supplierId),
	);
}

export function getRatingTrend(supplierId: number) {
	return api.get<RatingTrendResponse>(
		API_ROUTES.supplierRating.trend(supplierId),
	);
}

export type RatingLinesResult =
	| RatingLinesResponse<OnTimeLine>
	| RatingLinesResponse<RejectionLine>
	| RatingLinesResponse<PriceLine>;

export function getRatingLines<
	T extends OnTimeLine | RejectionLine | PriceLine,
>(supplierId: number, params: RatingLinesParams) {
	return api.get<RatingLinesResponse<T>>(
		`${API_ROUTES.supplierRating.lines(supplierId)}${toQueryString(params)}`,
	);
}
