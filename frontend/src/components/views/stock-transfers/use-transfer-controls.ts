import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import type { StStatus } from "@/types/stock-transfer";

export const ST_TABS = [
	{ key: "all", label: "All" },
	{ key: "draft", label: "Draft" },
	{ key: "posted", label: "Posted" },
	{ key: "cancelled", label: "Cancelled" },
	{ key: "reversed", label: "Reversed" },
] as const;

export type StTab = (typeof ST_TABS)[number]["key"];
const tabKeys = ST_TABS.map((entry) => entry.key) as [StTab, ...StTab[]];

// Tab, filters and page live in the URL (nuqs).
export function useTransferControls() {
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
	const [fromId, setFromRaw] = useQueryState("from", parseAsInteger);
	const [toId, setToRaw] = useQueryState("to", parseAsInteger);
	const [itemId, setItemRaw] = useQueryState("item", parseAsInteger);
	const [dateFrom, setDateFromRaw] = useQueryState("fromDate", parseAsString);
	const [dateTo, setDateToRaw] = useQueryState("toDate", parseAsString);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;
	// The API refuses fromDate > toDate.
	const rangeOk = !dateFrom || !dateTo || dateFrom <= dateTo;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		tab,
		statusParam: tab === "all" ? undefined : (tab as StStatus),
		fromId,
		toId,
		itemId,
		dateFrom,
		dateTo,
		rangeOk,
		filtersActive:
			fromId !== null ||
			toId !== null ||
			itemId !== null ||
			dateFrom !== null ||
			dateTo !== null,
		setPage,
		onTabChange: (next: string) => {
			void setTabRaw(next === "all" ? null : (next as StTab));
			setPage(1);
		},
		onFromChange: (next: number | null) => {
			void setFromRaw(next);
			setPage(1);
		},
		onToChange: (next: number | null) => {
			void setToRaw(next);
			setPage(1);
		},
		onItemChange: (next: number | null) => {
			void setItemRaw(next);
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
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
		reset: () => {
			void setTabRaw(null);
			void setFromRaw(null);
			void setToRaw(null);
			void setItemRaw(null);
			void setDateFromRaw(null);
			void setDateToRaw(null);
			setPage(1);
		},
	};
}
