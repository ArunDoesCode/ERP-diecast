"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ApiClientError } from "@/lib/api/client";
import type {
	OnTimeLine,
	PriceLine,
	RatingLinesParams,
	RatingListParams,
	RejectionLine,
} from "@/types/supplier-rating";

import {
	getRatingCard,
	getRatingLines,
	getRatingList,
	getRatingTrend,
} from "./fetchers";

export const supplierRatingKeys = {
	all: ["supplier-rating"] as const,
	list: (params?: RatingListParams) =>
		["supplier-rating", "list", params ?? {}] as const,
	card: (supplierId: number) =>
		["supplier-rating", "card", supplierId] as const,
	trend: (supplierId: number) =>
		["supplier-rating", "trend", supplierId] as const,
	lines: (supplierId: number, params: RatingLinesParams) =>
		["supplier-rating", "lines", supplierId, params] as const,
};

/** HTTP status of a failed rating call (404 supplier missing, 403 no permission), else undefined. */
export function ratingErrorStatus(error: unknown): number | undefined {
	return error instanceof ApiClientError ? error.status : undefined;
}

/** Retrying a 403 / 404 only delays the answer. */
function retryUnlessClientError(count: number, error: unknown) {
	const status = ratingErrorStatus(error);
	if (status !== undefined && status >= 400 && status < 500) return false;
	return count < 2;
}

export function useRatingListQuery(params: RatingListParams, enabled = true) {
	return useQuery({
		queryKey: supplierRatingKeys.list(params),
		queryFn: () => getRatingList(params),
		enabled,
		placeholderData: keepPreviousData,
		retry: retryUnlessClientError,
	});
}

export function useRatingCardQuery(supplierId: number, enabled = true) {
	return useQuery({
		queryKey: supplierRatingKeys.card(supplierId),
		queryFn: () => getRatingCard(supplierId),
		enabled: supplierId > 0 && enabled,
		retry: retryUnlessClientError,
	});
}

export function useRatingTrendQuery(supplierId: number, enabled = true) {
	return useQuery({
		queryKey: supplierRatingKeys.trend(supplierId),
		queryFn: () => getRatingTrend(supplierId),
		enabled: supplierId > 0 && enabled,
		retry: retryUnlessClientError,
	});
}

export function useRatingLinesQuery<
	T extends OnTimeLine | RejectionLine | PriceLine,
>(supplierId: number, params: RatingLinesParams, enabled = true) {
	return useQuery({
		queryKey: supplierRatingKeys.lines(supplierId, params),
		queryFn: () => getRatingLines<T>(supplierId, params),
		enabled: supplierId > 0 && enabled,
		placeholderData: keepPreviousData,
		retry: retryUnlessClientError,
	});
}
