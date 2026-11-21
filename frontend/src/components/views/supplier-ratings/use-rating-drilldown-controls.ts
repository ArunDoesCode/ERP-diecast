import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import {
	LINE_SORT_KEYS,
	type OnTimeVerdictFilter,
	type RatingMeasure,
} from "@/types/supplier-rating";

export const MEASURES = ["on_time", "rejection", "price"] as const;
export const VERDICT_QUICK: Array<{ key: OnTimeVerdictFilter; label: string }> =
	[
		{ key: "all", label: "All" },
		{ key: "late", label: "Late" },
		{ key: "on_time", label: "On time" },
		{ key: "no_due_date", label: "No due date" },
	];
const verdictKeys = ["all", "late", "on_time", "no_due_date"] as const;

// Measure, verdict, sort and page live in the URL (nuqs). A missing or wrong `measure` falls back to on_time.
export function useRatingDrilldownControls() {
	const [measureRaw, setMeasureRaw] = useQueryState(
		"measure",
		parseAsStringLiteral(MEASURES).withDefault("on_time"),
	);
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [verdictRaw, setVerdictRaw] = useQueryState(
		"verdict",
		parseAsStringLiteral(verdictKeys).withDefault("all"),
	);
	const [sortByRaw, setSortByRaw] = useQueryState("sortBy", parseAsString);
	const [sortDirRaw, setSortDirRaw] = useQueryState(
		"sortDir",
		parseAsStringLiteral(["asc", "desc"] as const),
	);

	const measure: RatingMeasure = measureRaw;
	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;
	const verdict: OnTimeVerdictFilter =
		measure === "on_time" ? verdictRaw : "all";
	// A sort key from another measure is dropped (the API answers 400 for it).
	const sortBy =
		sortByRaw && LINE_SORT_KEYS[measure].includes(sortByRaw)
			? sortByRaw
			: undefined;
	const sortDir = sortBy ? (sortDirRaw ?? "asc") : undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		measure,
		page,
		pageSize,
		verdict,
		sortBy,
		sortDir,
		setPage,
		onMeasureChange: (next: RatingMeasure) => {
			void setMeasureRaw(next === "on_time" ? null : next);
			void setVerdictRaw(null);
			void setSortByRaw(null);
			void setSortDirRaw(null);
			setPage(1);
		},
		onVerdictChange: (next: string) => {
			void setVerdictRaw(next === "all" ? null : (next as OnTimeVerdictFilter));
			setPage(1);
		},
		onSortChange: (by: string | null, dir: "asc" | "desc") => {
			void setSortByRaw(by);
			void setSortDirRaw(by ? dir : null);
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
	};
}
