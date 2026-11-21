import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import type { PrtStatus } from "@/types/purchase-return";

export const PRT_TABS = [
	{ key: "all", label: "All" },
	{ key: "draft", label: "Draft" },
	{ key: "posted", label: "Posted" },
	{ key: "cancelled", label: "Cancelled" },
	{ key: "awaiting", label: "Awaiting return" },
] as const;

export type PrtTab = (typeof PRT_TABS)[number]["key"];
const tabKeys = PRT_TABS.map((entry) => entry.key) as [PrtTab, ...PrtTab[]];

// Tab, filters and page live in the URL (nuqs).
export function useReturnControls() {
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
	const [dateFrom, setDateFromRaw] = useQueryState("from", parseAsString);
	const [dateTo, setDateToRaw] = useQueryState("to", parseAsString);
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

	// Both dates are needed to be a valid range; the API refuses from > to.
	const rangeOk = !dateFrom || !dateTo || dateFrom <= dateTo;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	const awaiting = tab === "awaiting";
	return {
		page,
		pageSize,
		tab,
		awaiting,
		statusParam: awaiting || tab === "all" ? undefined : (tab as PrtStatus),
		supplierId,
		dateFrom,
		dateTo,
		rangeOk,
		q,
		searchInput,
		filtersActive: awaiting
			? supplierId !== null
			: supplierId !== null ||
				dateFrom !== null ||
				dateTo !== null ||
				searchInput !== "",
		setPage,
		onTabChange: (next: string) => {
			void setTabRaw(next === "all" ? null : (next as PrtTab));
			setPage(1);
		},
		onSupplierChange: (next: number | null) => {
			void setSupplierRaw(next);
			setPage(1);
		},
		onDateFromChange: (value: string) => {
			void setDateFromRaw(value || null);
			setPage(1);
		},
		onDateToChange: (value: string) => {
			void setDateToRaw(value || null);
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
			void setSupplierRaw(null);
			void setDateFromRaw(null);
			void setDateToRaw(null);
			setPage(1);
		},
	};
}
