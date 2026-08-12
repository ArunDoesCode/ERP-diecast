import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PRStatus, PRType } from "@/types/purchase-requisitions";

export type SearchField = "prNumber" | "status" | "type";

export function usePRListControls() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [searchField, setSearchField] = useState<SearchField>("status");
	const [prNumberSearch, setPrNumberSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | PRStatus>("all");
	const [typeFilter, setTypeFilter] = useState<"all" | PRType>("all");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const debouncedPRNumber = useDebouncedValue(prNumberSearch, 350);
	const q =
		searchField === "prNumber"
			? debouncedPRNumber.trim() || undefined
			: searchField === "status" && statusFilter !== "all"
				? statusFilter
				: searchField === "type" && typeFilter !== "all"
					? typeFilter
					: undefined;

	function onSearchFieldChange(value: SearchField) {
		setSearchField(value);
		setPrNumberSearch("");
		setStatusFilter("all");
		setTypeFilter("all");
		setPage(1);
	}

	function onPRNumberChange(value: string) {
		setPrNumberSearch(value);
		setPage(1);
	}

	function onStatusFilterChange(value: "all" | PRStatus) {
		setStatusFilter(value);
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
		statusFilter,
		typeFilter,
		sortDir,
		setPage,
		onPageSizeChange,
		onSearchFieldChange,
		onPRNumberChange,
		onStatusFilterChange,
		onTypeFilterChange,
		onSortDirectionChange,
	};
}
