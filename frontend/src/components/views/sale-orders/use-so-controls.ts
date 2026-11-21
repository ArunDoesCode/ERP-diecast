import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const SO_STATUS_QUICK = [
	{ key: "open", label: "Open" },
	{ key: "draft", label: "Draft" },
	{ key: "confirmed", label: "Confirmed" },
	{ key: "on_hold", label: "On hold" },
	{ key: "closed", label: "Closed" },
	{ key: "cancelled", label: "Cancelled" },
	{ key: "all", label: "All" },
] as const;

type StatusKey = (typeof SO_STATUS_QUICK)[number]["key"];
const statusKeys = SO_STATUS_QUICK.map((entry) => entry.key) as [
	StatusKey,
	...StatusKey[],
];

const STATUS_PARAM: Record<StatusKey, string | undefined> = {
	open: "draft,confirmed,on_hold",
	draft: "draft",
	confirmed: "confirmed",
	on_hold: "on_hold",
	closed: "closed",
	cancelled: "cancelled",
	all: undefined,
};

// Filter and page state live in the URL (nuqs).
export function useSoControls() {
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
		parseAsStringLiteral(statusKeys).withDefault("open"),
	);
	const [customerId, setCustomerRaw] = useQueryState(
		"customer",
		parseAsInteger,
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
	const q = debounced.trim().length >= 2 ? debounced.trim() : undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		status,
		statusParam: STATUS_PARAM[status],
		customerId,
		q,
		searchInput,
		filtersActive:
			status !== "open" || customerId !== null || searchInput !== "",
		setPage,
		onStatusChange: (next: string) => {
			void setStatusRaw(next === "open" ? null : (next as StatusKey));
			setPage(1);
		},
		onCustomerChange: (next: number | null) => {
			void setCustomerRaw(next);
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
			void setCustomerRaw(null);
			void setStatusRaw(null);
			setPage(1);
		},
	};
}
