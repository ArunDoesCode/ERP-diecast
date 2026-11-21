import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const CUSTOMER_STATUS_QUICK = [
	{ key: "active", label: "Active" },
	{ key: "inactive", label: "Inactive" },
	{ key: "all", label: "All" },
] as const;

type StatusKey = (typeof CUSTOMER_STATUS_QUICK)[number]["key"];
const statusKeys = CUSTOMER_STATUS_QUICK.map((entry) => entry.key) as [
	StatusKey,
	...StatusKey[],
];

const IS_ACTIVE_PARAM: Record<StatusKey, boolean | undefined> = {
	active: true,
	inactive: false,
	all: undefined,
};

// Filter and page state live in the URL (nuqs).
export function useCustomerControls() {
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
		parseAsStringLiteral(statusKeys).withDefault("active"),
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
	// Fewer than 2 characters = no name filter (contract).
	const q = debounced.trim().length >= 2 ? debounced.trim() : undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		status,
		isActive: IS_ACTIVE_PARAM[status],
		q,
		searchInput,
		filtersActive: status !== "active" || searchInput !== "",
		setPage,
		onStatusChange: (next: string) => {
			void setStatusRaw(next === "active" ? null : (next as StatusKey));
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
			void setStatusRaw(null);
			setPage(1);
		},
	};
}
