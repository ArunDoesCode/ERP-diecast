import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { type PRType, prTypeValues } from "@/types/purchase-requisitions";

export type POQueueSearchField = "prNumber" | "type";
export type POQueueStatusFilter = "all" | "approved" | "partial_ordered";

const PAGE_SIZES = [10, 20, 50];
const statusValues = ["all", "approved", "partial_ordered"] as const;

// Filter and page state live in the URL (BR-DS-17, nuqs).
export function usePOQueueControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [searchField, setSearchFieldRaw] = useQueryState(
		"field",
		parseAsStringLiteral(["prNumber", "type"] as const).withDefault("prNumber"),
	);
	const [urlSearch, setUrlSearch] = useQueryState(
		"search",
		parseAsString.withDefault(""),
	);
	const [urlType, setUrlType] = useQueryState(
		"type",
		parseAsStringLiteral(prTypeValues),
	);
	const [status, setStatusRaw] = useQueryState(
		"status",
		parseAsStringLiteral(statusValues).withDefault("all"),
	);
	const [sortDirRaw, setSortDirRaw] = useQueryState(
		"sort",
		parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
	);

	// A hand-edited URL (?page=-3, ?pageSize=7) falls back to the defaults.
	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 10;

	// Typing stays local so every keystroke is not a URL write; the debounced value
	// is what the query and the URL use.
	const [typing, setTyping] = useState<string | null>(null);
	// Back/forward changes the URL search: drop local typing that no longer matches it.
	useEffect(() => {
		setTyping((current) =>
			current !== null && (current.trim() ? current : "") !== urlSearch
				? null
				: current,
		);
	}, [urlSearch]);
	const prNumberSearch = typing ?? urlSearch;
	const debouncedPRNumber = useDebouncedValue(prNumberSearch, 350);

	const typeFilter: "all" | PRType = urlType ?? "all";
	const sortDir = sortDirRaw;
	const q =
		searchField === "prNumber"
			? debouncedPRNumber.trim() || undefined
			: typeFilter !== "all"
				? typeFilter
				: undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	function onSearchFieldChange(value: POQueueSearchField) {
		void setSearchFieldRaw(value === "prNumber" ? null : value);
		setTyping(null);
		void setUrlSearch(null);
		void setUrlType(null);
		setPage(1);
	}

	function onPRNumberChange(value: string) {
		setTyping(value);
		void setUrlSearch(value.trim() ? value : null);
		setPage(1);
	}

	function onTypeFilterChange(value: "all" | PRType) {
		void setUrlType(value === "all" ? null : value);
		setPage(1);
	}

	function onSortDirectionChange(isDesc: boolean) {
		void setSortDirRaw(isDesc ? null : "asc");
		setPage(1);
	}

	function onPageSizeChange(nextPageSize: number) {
		void setPageSizeRaw(nextPageSize === 10 ? null : nextPageSize);
		setPage(1);
	}

	function onStatusChange(next: POQueueStatusFilter) {
		void setStatusRaw(next === "all" ? null : next);
		setPage(1);
	}

	function resetFilters() {
		setTyping(null);
		void setUrlSearch(null);
		void setUrlType(null);
		void setStatusRaw(null);
		setPage(1);
	}

	const filtersActive =
		status !== "all" || q !== undefined || prNumberSearch.trim() !== "";

	return {
		page,
		pageSize,
		q,
		searchField,
		prNumberSearch,
		typeFilter,
		sortDir,
		status,
		filtersActive,
		setPage,
		onPageSizeChange,
		onSearchFieldChange,
		onPRNumberChange,
		onTypeFilterChange,
		onSortDirectionChange,
		onStatusChange,
		resetFilters,
	};
}
