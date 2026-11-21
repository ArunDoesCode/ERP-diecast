import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const REORDER_STATE_QUICK = [
	{ key: "all", label: "All" },
	{ key: "will_be_ordered", label: "Will be ordered" },
	{ key: "covered", label: "Covered" },
	{ key: "needs_reorder_qty", label: "Needs a reorder qty" },
	{ key: "ok", label: "OK" },
] as const;

type StateKey = (typeof REORDER_STATE_QUICK)[number]["key"];
const stateKeys = REORDER_STATE_QUICK.map((entry) => entry.key) as [
	StateKey,
	...StateKey[],
];
const DEFAULT_STATE: StateKey = "will_be_ordered";

// Filter and page state live in the URL (nuqs). Default filter: will_be_ordered.
export function useReorderControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [state, setStateRaw] = useQueryState(
		"state",
		parseAsStringLiteral(stateKeys).withDefault(DEFAULT_STATE),
	);
	const [urlSearch, setUrlSearch] = useQueryState(
		"q",
		parseAsString.withDefault(""),
	);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;

	const [typing, setTyping] = useState<string | null>(null);
	useEffect(() => {
		setTyping((current) =>
			current !== null && (current.trim() ? current : "") !== urlSearch
				? null
				: current,
		);
	}, [urlSearch]);
	const searchInput = typing ?? urlSearch;
	const debounced = useDebouncedValue(searchInput, 350);
	const q = debounced.trim() || undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		state,
		stateParam: state === "all" ? undefined : state,
		q,
		searchInput,
		filtersActive: state !== DEFAULT_STATE || searchInput !== "",
		setPage,
		showAll: () => {
			void setStateRaw("all");
			setPage(1);
		},
		onStateChange: (next: string) => {
			void setStateRaw(next === DEFAULT_STATE ? null : (next as StateKey));
			setPage(1);
		},
		onSearchChange: (value: string) => {
			setTyping(value);
			void setUrlSearch(value.trim() ? value : null);
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
		reset: () => {
			setTyping(null);
			void setUrlSearch(null);
			void setStateRaw(null);
			setPage(1);
		},
	};
}

export const RUN_STATE_QUICK = [
	{ key: "all", label: "All" },
	{ key: "running", label: "Running" },
	{ key: "done", label: "Done" },
	{ key: "failed", label: "Failed" },
] as const;

type RunStateKey = (typeof RUN_STATE_QUICK)[number]["key"];
const runStateKeys = RUN_STATE_QUICK.map((entry) => entry.key) as [
	RunStateKey,
	...RunStateKey[],
];
const TRIGGER_KEYS = ["all", "schedule", "manual"] as const;

export function useReorderRunsControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [state, setStateRaw] = useQueryState(
		"state",
		parseAsStringLiteral(runStateKeys).withDefault("all"),
	);
	const [trigger, setTriggerRaw] = useQueryState(
		"trigger",
		parseAsStringLiteral(TRIGGER_KEYS).withDefault("all"),
	);
	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		state,
		stateParam: state === "all" ? undefined : state,
		trigger,
		triggerParam: trigger === "all" ? undefined : trigger,
		filtersActive: state !== "all" || trigger !== "all",
		setPage,
		onStateChange: (next: string) => {
			void setStateRaw(next === "all" ? null : (next as RunStateKey));
			setPage(1);
		},
		onTriggerChange: (next: string) => {
			void setTriggerRaw(
				next === "all" ? null : (next as "schedule" | "manual"),
			);
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
		reset: () => {
			void setStateRaw(null);
			void setTriggerRaw(null);
			setPage(1);
		},
	};
}
