import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { type BomKind, bomKindValues } from "@/types/bom";

export const BOM_STATUS_QUICK = [
	{ key: "active_draft", label: "Active + draft" },
	{ key: "active", label: "Active" },
	{ key: "draft", label: "Draft" },
	{ key: "retired", label: "Retired" },
	{ key: "all", label: "All" },
] as const;

type StatusKey = (typeof BOM_STATUS_QUICK)[number]["key"];
const statusKeys = BOM_STATUS_QUICK.map((entry) => entry.key) as [
	StatusKey,
	...StatusKey[],
];

// "Active + draft" is the server default, so it sends no status param.
const STATUS_PARAM: Record<StatusKey, string | undefined> = {
	active_draft: undefined,
	active: "active",
	draft: "draft",
	retired: "retired",
	all: "draft,active,retired",
};

// Filter and page state live in the URL (BR-DS-17, nuqs).
export function useBomControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [status, setStatusRaw] = useQueryState(
		"status",
		parseAsStringLiteral(statusKeys).withDefault("active_draft"),
	);
	const [kind, setKindRaw] = useQueryState(
		"kind",
		parseAsStringLiteral(bomKindValues),
	);
	const [urlSearch, setUrlSearch] = useQueryState(
		"q",
		parseAsString.withDefault(""),
	);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;

	const [typing, setTyping] = useState<string | null>(null);
	// Back/forward changes the URL search: drop local typing that no longer matches it.
	useEffect(() => {
		setTyping((current) =>
			current !== null && (current.trim() ? current : "") !== urlSearch
				? null
				: current,
		);
	}, [urlSearch]);
	const searchInput = typing ?? urlSearch;
	const debounced = useDebouncedValue(searchInput, 350);
	const q = debounced.trim().length >= 2 ? debounced.trim() : undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		status,
		statusParam: STATUS_PARAM[status],
		kind,
		q,
		searchInput,
		filtersActive:
			status !== "active_draft" || kind !== null || searchInput !== "",
		setPage,
		onStatusChange: (next: string) => {
			void setStatusRaw(next === "active_draft" ? null : (next as StatusKey));
			setPage(1);
		},
		onKindChange: (next: "all" | BomKind) => {
			void setKindRaw(next === "all" ? null : next);
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
			void setKindRaw(null);
			void setStatusRaw(null);
			setPage(1);
		},
	};
}
