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
	PrBucket,
	PrListSortField,
} from "@/lib/api/purchase-requisitions/list-types";
import type { PRStatus } from "@/types/purchase-requisitions";

/** Summary-strip groups (BR-FF-109); they do not overlap. */
export const prGroupValues = [
	"draft",
	"in_approval",
	"to_order",
	"ordered",
	"closed",
] as const;
export type PrGroup = (typeof prGroupValues)[number];

const GROUP_STATUSES: Record<PrGroup, PRStatus[] | undefined> = {
	draft: ["draft"],
	in_approval: ["pending_approval"],
	to_order: undefined,
	ordered: ["approved", "partial_ordered", "fully_ordered"],
	closed: ["rejected", "cancelled"],
};

const flag = ["1", "true"] as const;
const sortFields = [
	"id",
	"prNumber",
	"type",
	"status",
	"createdAt",
	"estimatedAmountPaise",
] as const;

// Filters and page live in the URL so Home tiles open the list filtered:
// ?mine=1&status=draft, ?toOrder=1&bucket=late.
export function usePRListControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSize, setPageSizeState] = usePageSize("pr");
	const [urlSearch, setUrlSearch] = useQueryState(
		"search",
		parseAsString.withDefault(""),
	);
	const [urlStatus, setUrlStatus] = useQueryState(
		"status",
		parseAsStringLiteral([
			"draft",
			"pending_approval",
			"ordered",
			"closed",
		] as const),
	);
	const [urlToOrder, setUrlToOrder] = useQueryState(
		"toOrder",
		parseAsStringLiteral(flag),
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
	const bucket: PrBucket | null = urlBucket;
	// A bucket only makes sense on "To order"; the server rejects it otherwise.
	const toOrder = urlToOrder !== null || bucket !== null;
	const mine = urlMine !== null;
	const group: PrGroup | null = toOrder
		? "to_order"
		: urlStatus === "draft"
			? "draft"
			: urlStatus === "pending_approval"
				? "in_approval"
				: urlStatus === "ordered"
					? "ordered"
					: urlStatus === "closed"
						? "closed"
						: null;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	function onQChange(value: string) {
		setTyping(value);
		void setUrlSearch(value.trim() ? value : null);
		setPage(1);
	}

	/** Clicking the selected group clears it (BR-FF-109). */
	function onGroupChange(next: PrGroup | null) {
		const target = next === group ? null : next;
		void setUrlToOrder(target === "to_order" ? "1" : null);
		void setUrlStatus(
			target === null || target === "to_order"
				? null
				: target === "in_approval"
					? "pending_approval"
					: target,
		);
		void setUrlBucket(null);
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

	function onSortByChange(value: PrListSortField) {
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
		void setUrlToOrder(null);
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
		status: group ? GROUP_STATUSES[group] : undefined,
		// "Ordered" excludes rows still waiting for an order (those are "To order").
		toOrder: toOrder ? true : group === "ordered" ? false : undefined,
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
