import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { ScoSortField, ScoStatus } from "@/types/subcontracting";

export const SCO_STATUS_FILTER_OPTIONS: Array<{
	label: string;
	value: "all" | ScoStatus;
}> = [
	{ label: "All statuses", value: "all" },
	{ label: "Draft", value: "draft" },
	{ label: "Pending approval", value: "pending_approval" },
	{ label: "Approved", value: "approved" },
	{ label: "Rejected", value: "rejected" },
	{ label: "Sent back", value: "require_more_info" },
	{ label: "Material issued", value: "material_issued" },
	{ label: "Material received", value: "material_received" },
	{ label: "Closed", value: "closed" },
	{ label: "Cancelled", value: "cancelled" },
];

export function useScoControls() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [q, setQ] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | ScoStatus>("all");
	const [sortBy, setSortBy] = useState<ScoSortField>("createdAt");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const debouncedQ = useDebouncedValue(q, 350);

	return {
		page,
		pageSize,
		q: debouncedQ.trim() || undefined,
		qInput: q,
		status: statusFilter === "all" ? undefined : statusFilter,
		statusFilter,
		sortBy,
		sortDir,
		setPage,
		onQChange: (value: string) => {
			setQ(value);
			setPage(1);
		},
		onStatusFilterChange: (value: "all" | ScoStatus) => {
			setStatusFilter(value);
			setPage(1);
		},
		onSortByChange: (value: ScoSortField) => {
			setSortBy(value);
			setPage(1);
		},
		onSortDirectionChange: (isDesc: boolean) => {
			setSortDir(isDesc ? "desc" : "asc");
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			setPageSize(next);
			setPage(1);
		},
	};
}
