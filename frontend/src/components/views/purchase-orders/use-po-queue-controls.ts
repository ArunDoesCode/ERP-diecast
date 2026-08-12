import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PRType } from "@/types/purchase-requisitions";

export type POQueueSearchField = "prNumber" | "type";

export function usePOQueueControls() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [searchField, setSearchField] =
		useState<POQueueSearchField>("prNumber");
	const [prNumberSearch, setPrNumberSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<"all" | PRType>("all");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const debouncedPRNumber = useDebouncedValue(prNumberSearch, 350);
	const q =
		searchField === "prNumber"
			? debouncedPRNumber.trim() || undefined
			: typeFilter !== "all"
				? typeFilter
				: undefined;

	function onSearchFieldChange(value: POQueueSearchField) {
		setSearchField(value);
		setPrNumberSearch("");
		setTypeFilter("all");
		setPage(1);
	}

	function onPRNumberChange(value: string) {
		setPrNumberSearch(value);
		setPage(1);
	}

	function onTypeFilterChange(value: "all" | PRType) {
		setTypeFilter(value);
		setPage(1);
	}

	function onSortDirectionChange(isDesc: boolean) {
		setSortDir(isDesc ? "desc" : "asc");
		setPage(1);
	}

	function onPageSizeChange(nextPageSize: number) {
		setPageSize(nextPageSize);
		setPage(1);
	}

	return {
		page,
		pageSize,
		q,
		searchField,
		prNumberSearch,
		typeFilter,
		sortDir,
		setPage,
		onPageSizeChange,
		onSearchFieldChange,
		onPRNumberChange,
		onTypeFilterChange,
		onSortDirectionChange,
	};
}
