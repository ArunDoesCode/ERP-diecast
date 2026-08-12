import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { GrnQaStatus, GrnSortField, GrnStatus } from "@/types/grn";

export function useGrnTrackingControls() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [q, setQ] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | GrnStatus>("all");
	const [qaStatusFilter, setQaStatusFilter] = useState<"all" | GrnQaStatus>(
		"all",
	);
	const [sortBy, setSortBy] = useState<GrnSortField>("id");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const debouncedQ = useDebouncedValue(q, 350);

	function onQChange(value: string) {
		setQ(value);
		setPage(1);
	}

	function onStatusFilterChange(value: "all" | GrnStatus) {
		setStatusFilter(value);
		setPage(1);
	}

	function onQaStatusFilterChange(value: "all" | GrnQaStatus) {
		setQaStatusFilter(value);
		setPage(1);
	}

	function onSortByChange(value: GrnSortField) {
		setSortBy(value);
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
		q: debouncedQ.trim() || undefined,
		qInput: q,
		status: statusFilter === "all" ? undefined : statusFilter,
		statusFilter,
		qaStatus: qaStatusFilter === "all" ? undefined : qaStatusFilter,
		qaStatusFilter,
		sortBy,
		sortDir,
		setPage,
		onQChange,
		onStatusFilterChange,
		onQaStatusFilterChange,
		onSortByChange,
		onSortDirectionChange,
		onPageSizeChange,
	};
}
