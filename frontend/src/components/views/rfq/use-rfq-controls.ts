import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const RFQ_TABS = [
	{ key: "all", label: "All" },
	{ key: "draft", label: "Draft" },
	{ key: "sent", label: "Sent" },
	{ key: "partially_awarded", label: "Partly awarded" },
	{ key: "awarded", label: "Awarded" },
	{ key: "closed", label: "Closed" },
] as const;

export type RfqTab = (typeof RFQ_TABS)[number]["key"];
const tabKeys = RFQ_TABS.map((entry) => entry.key) as [RfqTab, ...RfqTab[]];

// Tab, supplier, search and page live in the URL (nuqs).
export function useRfqControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [tab, setTabRaw] = useQueryState(
		"tab",
		parseAsStringLiteral(tabKeys).withDefault("all"),
	);
	const [supplierId, setSupplierRaw] = useQueryState(
		"supplier",
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
	const q = debounced.trim() ? debounced.trim().slice(0, 100) : undefined;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		tab,
		q,
		supplierId: supplierId ?? undefined,
		searchInput,
		filtersActive: searchInput !== "" || supplierId !== null,
		setPage,
		onTabChange: (next: string) => {
			void setTabRaw(next === "all" ? null : (next as RfqTab));
			setPage(1);
		},
		onSupplierChange: (next: number | undefined) => {
			void setSupplierRaw(next ?? null);
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
			void setTabRaw(null);
			void setSupplierRaw(null);
			setPage(1);
		},
	};
}
