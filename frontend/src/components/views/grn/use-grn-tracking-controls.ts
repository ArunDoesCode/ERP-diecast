import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePageSize } from "@/hooks/use-page-size";
import type { GrnBucket } from "@/lib/api/grn/list-types";
import type { GrnSortField } from "@/types/grn";

/** Summary-strip groups (BR-FF-109). Draft and QA pending overlap. */
export const grnGroupValues = [
	"draft",
	"qa_pending",
	"done",
	"rejected",
] as const;
export type GrnGroup = (typeof grnGroupValues)[number];

const bucketValues = ["late", "today", "later"] as const;

// Filter and page state live in the URL (nuqs) so Home tiles can open the list filtered:
// /grn?qaStatus=pending&bucket=late.
export function useGrnTrackingControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSize, setPageSizeState] = usePageSize("grn");
	const [urlSearch, setUrlSearch] = useQueryState(
		"search",
		parseAsString.withDefault(""),
	);
	const [urlStatus, setUrlStatus] = useQueryState(
		"status",
		parseAsStringLiteral(["draft", "done", "rejected"] as const),
	);
	const [urlQa, setUrlQa] = useQueryState(
		"qaStatus",
		parseAsStringLiteral(["pending"] as const),
	);
	const [urlBucket, setUrlBucket] = useQueryState(
		"bucket",
		parseAsStringLiteral(bucketValues),
	);
	const [sortByRaw, setSortByRaw] = useQueryState(
		"sortBy",
		parseAsStringLiteral([
			"id",
			"grnNumber",
			"status",
			"receivedDate",
		] as const).withDefault("id"),
	);
	const [sortDirRaw, setSortDirRaw] = useQueryState(
		"sort",
		parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
	);

	const [typing, setTyping] = useState<string | null>(null);
	const qInput = typing ?? urlSearch;
	const debouncedQ = useDebouncedValue(qInput, 350);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const group: GrnGroup | null = urlQa
		? "qa_pending"
		: urlStatus === "draft"
			? "draft"
			: urlStatus === "done"
				? "done"
				: urlStatus === "rejected"
					? "rejected"
					: null;
	const bucket: GrnBucket | null = urlBucket;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	function onQChange(value: string) {
		setTyping(value);
		void setUrlSearch(value.trim() ? value : null);
		setPage(1);
	}

	/** Clicking the selected group clears it (BR-FF-109). A changed group drops the bucket. */
	function onGroupChange(next: GrnGroup | null) {
		const target = next === group ? null : next;
		void setUrlQa(target === "qa_pending" ? "pending" : null);
		void setUrlStatus(
			target === "draft" || target === "done" || target === "rejected"
				? target
				: null,
		);
		void setUrlBucket(null);
		setPage(1);
	}

	function clearBucket() {
		void setUrlBucket(null);
		setPage(1);
	}

	function onSortByChange(value: GrnSortField) {
		void setSortByRaw(value === "id" ? null : value);
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
		void setUrlQa(null);
		void setUrlStatus(null);
		void setUrlBucket(null);
		setPage(1);
	}

	const filtersActive =
		qInput.trim() !== "" || group !== null || bucket !== null;

	return {
		page,
		pageSize,
		q: debouncedQ.trim() || undefined,
		qInput,
		group,
		bucket,
		status:
			group === "draft"
				? "draft"
				: group === "done"
					? "accepted,partial_accepted"
					: group === "rejected"
						? "rejected"
						: undefined,
		qaStatus: group === "qa_pending" ? ("pending" as const) : undefined,
		sortBy: sortByRaw,
		sortDir: sortDirRaw,
		setPage,
		onQChange,
		onGroupChange,
		clearBucket,
		onSortByChange,
		onSortDirectionChange,
		onPageSizeChange,
		resetFilters,
		filtersActive,
	};
}
