import { parseAsInteger, useQueryState } from "nuqs";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

// Filters and page live in the URL (nuqs).
export function usePendingControls() {
	const [pageRaw, setPageRaw] = useQueryState(
		"page",
		parseAsInteger.withDefault(1),
	);
	const [pageSizeRaw, setPageSizeRaw] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);
	const [customerId, setCustomerRaw] = useQueryState(
		"customer",
		parseAsInteger,
	);
	const [itemId, setItemRaw] = useQueryState("item", parseAsInteger);

	const page = pageRaw >= 1 ? pageRaw : 1;
	const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 10;

	function setPage(next: number) {
		void setPageRaw(next === 1 ? null : next);
	}

	return {
		page,
		pageSize,
		customerId,
		itemId,
		filtersActive: customerId !== null || itemId !== null,
		setPage,
		onCustomerChange: (next: number | null) => {
			void setCustomerRaw(next);
			setPage(1);
		},
		onItemChange: (next: number | null) => {
			void setItemRaw(next);
			setPage(1);
		},
		onPageSizeChange: (next: number) => {
			void setPageSizeRaw(next === 10 ? null : next);
			setPage(1);
		},
		reset: () => {
			void setCustomerRaw(null);
			void setItemRaw(null);
			setPage(1);
		},
	};
}
