import {
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import type { DnStatus } from "@/types/delivery-note";

export const DN_TABS = [
	{ key: "all", label: "All" },
	{ key: "draft", label: "Draft" },
	{ key: "posted", label: "Posted" },
	{ key: "cancelled", label: "Cancelled" },
] as const;

export type DnTab = (typeof DN_TABS)[number]["key"];
const tabKeys = DN_TABS.map((entry) => entry.key) as [DnTab, ...DnTab[]];

// Status chip, filters and page live in the URL (nuqs).
export function useDnControls() {
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
	const [customerId, setCustomerRaw] = useQueryState(
		"customer",
		parseAsInteger,
	);
	const [dateFrom, setDateFromRaw] = useQueryState("from", parseAsString);
	const [dateTo, setDateToRaw] = useQueryState("to", parseAsString);
	const [ewayMissing, setEwayMissingRaw] = useQueryState(
		"ewayMissing",
		parseAsBoolean.withDefault(false),
	);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;
	// The API refuses from > to.
	const rangeOk = !dateFrom || !dateTo || dateFrom <= dateTo;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		tab,
		statusParam: tab === "all" ? undefined : (tab as DnStatus),
		customerId,
		dateFrom,
		dateTo,
		ewayMissing,
		rangeOk,
		filtersActive:
			customerId !== null ||
			dateFrom !== null ||
			dateTo !== null ||
			ewayMissing,
		setPage,
		onTabChange: (next: string) => {
			void setTabRaw(next === "all" ? null : (next as DnTab));
			setPage(1);
		},
		onCustomerChange: (next: number | null) => {
			void setCustomerRaw(next);
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
		onEwayMissingChange: (next: boolean) => {
			void setEwayMissingRaw(next ? true : null);
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
		reset: () => {
			void setCustomerRaw(null);
			void setDateFromRaw(null);
			void setDateToRaw(null);
			void setEwayMissingRaw(null);
			setPage(1);
		},
	};
}
