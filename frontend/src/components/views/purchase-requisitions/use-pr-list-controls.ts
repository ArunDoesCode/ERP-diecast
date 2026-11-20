import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PRStatus, PRType } from "@/types/purchase-requisitions";

// Free text matches PR number and notes only; status and type go to their own
// query params (BR-PR-48).
export function usePRListControls() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | PRStatus>("all");
	const [typeFilter, setTypeFilter] = useState<"all" | PRType>("all");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const debouncedSearch = useDebouncedValue(search, 350);
	const q = debouncedSearch.trim() || undefined;
	const status = statusFilter === "all" ? undefined : statusFilter;
	const type = typeFilter === "all" ? undefined : typeFilter;
	const filtersActive =
		statusFilter !== "all" || typeFilter !== "all" || search.trim() !== "";

	function onSearchChange(value: string) {
		setSearch(value);
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

	function resetFilters() {
		setSearch("");
		setStatusFilter("all");
		setTypeFilter("all");
		setPage(1);
	}

	return {
		page,
		pageSize,
		q,
		search,
		status,
		statusFilter,
		type,
		typeFilter,
		sortDir,
		filtersActive,
		setPage,
		onPageSizeChange,
		onSearchChange,
		onStatusFilterChange,
		onTypeFilterChange,
		onSortDirectionChange,
		resetFilters,
	};
}
