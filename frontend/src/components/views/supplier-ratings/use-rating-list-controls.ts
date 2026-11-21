import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import type {
	RatingListSortField,
	RatingStatusFilter,
} from "@/types/supplier-rating";

export const RATING_STATUS_QUICK: Array<{
	key: RatingStatusFilter;
	label: string;
}> = [
	{ key: "active", label: "Active" },
	{ key: "all", label: "All" },
];

const statusKeys = ["active", "inactive", "all"] as const;
export const RATING_SORT_FIELDS = [
	"name",
	"score",
	"onTimePct",
	"rejectionPct",
	"priceVariancePct",
	"judgedLines",
	"decidedLines",
] as const satisfies readonly RatingListSortField[];

// Status, search, sort and page live in the URL (nuqs).
export function useRatingListControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [status, setStatusRaw] = useQueryState(
		"status",
		parseAsStringLiteral(statusKeys).withDefault("active"),
	);
	const [urlSearch, setUrlSearch] = useQueryState(
		"q",
		parseAsString.withDefault(""),
	);
	const [sortBy, setSortByRaw] = useQueryState(
		"sortBy",
		parseAsStringLiteral(RATING_SORT_FIELDS),
	);
	const [sortDir, setSortDirRaw] = useQueryState(
		"sortDir",
		parseAsStringLiteral(["asc", "desc"] as const),
	);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;

	const [typing, setTyping] = useState<string | null>(null);
	useEffect(() => {
		setTyping((current) =>
			current !== null && (current.trim() ? current : "") !== urlSearch
				? null
				: current,
		);
	}, [urlSearch]);
	const searchInput = typing ?? urlSearch;
	const debounced = useDebouncedValue(searchInput, 350);
	const q = debounced.trim() ? debounced.trim().slice(0, 100) : undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		status,
		q,
		sortBy: sortBy ?? undefined,
		sortDir: sortDir ?? undefined,
		searchInput,
		filtersActive: searchInput !== "" || status !== "active",
		setPage,
		onStatusChange: (next: string) => {
			void setStatusRaw(
				next === "active" ? null : (next as RatingStatusFilter),
			);
			setPage(1);
		},
		onSearchChange: (value: string) => {
			setTyping(value);
			void setUrlSearch(value.trim() ? value : null);
			setPage(1);
		},
		onSortChange: (by: RatingListSortField | null, dir: "asc" | "desc") => {
			void setSortByRaw(by);
			void setSortDirRaw(by ? dir : null);
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
		reset: () => {
			setTyping(null);
			void setUrlSearch(null);
			void setStatusRaw(null);
			setPage(1);
		},
	};
}
