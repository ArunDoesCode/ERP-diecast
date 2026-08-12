import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { POSortField, POStatus } from "@/types/purchase-orders";

export const PO_TRACKING_STATUS_OPTIONS: Array<{
	label: string;
	value: "active" | POStatus;
}> = [
	{ label: "Active (pending → dispatched)", value: "active" },
	{ label: "Draft", value: "draft" },
	{ label: "Pending approval", value: "pending_approval" },
	{ label: "Approved", value: "approved" },
	{ label: "Dispatched", value: "dispatched" },
	{ label: "Partially received", value: "partial_received" },
	{ label: "Fully received", value: "fully_received" },
	{ label: "Invoiced", value: "invoiced" },
	{ label: "Closed", value: "closed" },
	{ label: "Cancelled", value: "cancelled" },
];

const ACTIVE_STATUSES: POStatus[] = [
	"pending_approval",
	"approved",
	"dispatched",
];

export function usePOTrackingControls() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [q, setQ] = useState("");
	const [statusFilter, setStatusFilter] = useState<"active" | POStatus>(
		"active",
	);
	const [sortBy, setSortBy] = useState<POSortField>("createdAt");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const [overdueOnly, setOverdueOnly] = useState(false);

	const debouncedQ = useDebouncedValue(q, 350);
	const status: POStatus | POStatus[] =
		statusFilter === "active" ? ACTIVE_STATUSES : statusFilter;

	function onQChange(value: string) {
		setQ(value);
		setPage(1);
	}

	function onStatusFilterChange(value: "active" | POStatus) {
		setStatusFilter(value);
		setPage(1);
	}

	function onSortByChange(value: POSortField) {
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

	function onOverdueToggle(checked: boolean) {
		setOverdueOnly(checked);
		if (
			checked &&
			statusFilter !== "active" &&
			statusFilter !== "dispatched" &&
			statusFilter !== "partial_received"
		) {
			setStatusFilter("active");
		}
		setPage(1);
	}

	return {
		page,
		pageSize,
		q: debouncedQ.trim() || undefined,
		qInput: q,
		status,
		statusFilter,
		sortBy,
		sortDir,
		overdueOnly,
		setPage,
		onQChange,
		onStatusFilterChange,
		onSortByChange,
		onSortDirectionChange,
		onPageSizeChange,
		onOverdueToggle,
	};
}
