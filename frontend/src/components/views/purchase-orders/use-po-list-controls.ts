import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePageSize } from "@/hooks/use-page-size";
import type {
	PoBucket,
	PoListSortField,
} from "@/lib/api/purchase-orders/list-types";
import type { POStatus } from "@/types/purchase-orders";

/** Summary-strip groups (BR-FF-109). Every Late row is also Open. */
export const poGroupValues = [
	"draft",
	"in_approval",
	"to_send",
	"open",
	"late",
] as const;
export type PoGroup = (typeof poGroupValues)[number];

const flag = ["1", "true"] as const;
const sortFields = [
	"id",
	"poNumber",
	"status",
	"createdAt",
	"dueDate",
	"totalAmountPaise",
] as const;

// URL: ?status=draft|pending_approval|approved|open, ?bucket=late|today|later, ?mine=1.
// bucket=late with no status is the Late group (same as overdue).
export function usePOListControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSize, setPageSizeState] = usePageSize("po");
	const [urlSearch, setUrlSearch] = useQueryState(
		"search",
		parseAsString.withDefault(""),
	);
	const [urlStatus, setUrlStatus] = useQueryState(
		"status",
		parseAsStringLiteral([
			"draft",
			"pending_approval",
			"approved",
			"open",
		] as const),
	);
	const [urlMine, setUrlMine] = useQueryState(
		"mine",
		parseAsStringLiteral(flag),
	);
	const [urlBucket, setUrlBucket] = useQueryState(
		"bucket",
		parseAsStringLiteral(["late", "today", "later"] as const),
	);
	const [sortBy, setSortByRaw] = useQueryState(
		"sortBy",
		parseAsStringLiteral(sortFields).withDefault("createdAt"),
	);
	const [sortDir, setSortDirRaw] = useQueryState(
		"sort",
		parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
	);

	const [typing, setTyping] = useState<string | null>(null);
	const qInput = typing ?? urlSearch;
	const debouncedQ = useDebouncedValue(qInput, 350);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const bucket: PoBucket | null = urlBucket;
	const mine = urlMine !== null;
	const group: PoGroup | null =
		urlStatus === null
			? bucket === "late"
				? "late"
				: null
			: urlStatus === "pending_approval"
				? "in_approval"
				: urlStatus === "approved"
					? "to_send"
					: urlStatus;
	const status: POStatus[] | undefined =
		urlStatus === "open"
			? ["dispatched", "partial_received"]
			: urlStatus
				? [urlStatus]
				: undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	function onQChange(value: string) {
		setTyping(value);
		void setUrlSearch(value.trim() ? value : null);
		setPage(1);
	}

	/** Clicking the selected group clears it (BR-FF-109). */
	function onGroupChange(next: PoGroup | null) {
		const target = next === group ? null : next;
		void setUrlStatus(
			target === null || target === "late"
				? null
				: target === "in_approval"
					? "pending_approval"
					: target === "to_send"
						? "approved"
						: target,
		);
		void setUrlBucket(target === "late" ? "late" : null);
		setPage(1);
	}

	function clearBucket() {
		void setUrlBucket(null);
		setPage(1);
	}

	function clearMine() {
		void setUrlMine(null);
		setPage(1);
	}

	function onSortByChange(value: PoListSortField) {
		void setSortByRaw(value === "createdAt" ? null : value);
		setPage(1);
	}

	function onSortDirectionChange(isDesc: boolean) {
		void setSortDirRaw(isDesc ? null : "asc");
		setPage(1);
	}

	function onPageSizeChange(next: number) {
		setPageSizeState(next);
		setPage(1);
	}

	function resetFilters() {
		setTyping(null);
		void setUrlSearch(null);
		void setUrlStatus(null);
		void setUrlMine(null);
		void setUrlBucket(null);
		setPage(1);
	}

	const filtersActive =
		qInput.trim() !== "" || group !== null || bucket !== null || mine;

	return {
		page,
		pageSize,
		q: debouncedQ.trim() || undefined,
		qInput,
		group,
		bucket,
		mine,
		status,
		sortBy,
		sortDir,
		setPage,
		onQChange,
		onGroupChange,
		clearBucket,
		clearMine,
		onSortByChange,
		onSortDirectionChange,
		onPageSizeChange,
		resetFilters,
		filtersActive,
	};
}
