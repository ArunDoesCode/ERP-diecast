"use client";

import { useMemo, useState } from "react";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAssetItemsLookupQuery } from "@/lib/api/suppliers/queries";

type ScoItemPickerProps = {
	value?: number;
	/** Label to show for `value` before/without a search result (edit mode, prior pick). */
	valueLabel?: string;
	placeholder: string;
	onChange: (itemId: number, label: string) => void;
};

export function ScoItemPicker({
	value,
	valueLabel,
	placeholder,
	onChange,
}: ScoItemPickerProps) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 300);
	const query = useAssetItemsLookupQuery(debounced, 20);

	const options = useMemo(() => {
		const found: SearchableSelectOption[] = (
			query.data?.pages.flatMap((page) => page.data) ?? []
		).map((item) => ({
			value: String(item.id),
			label: `${item.sku} · ${item.name}`,
			secondaryLabel: item.uom,
		}));
		if (value && !found.some((option) => option.value === String(value))) {
			found.unshift({
				value: String(value),
				label: valueLabel ?? `Item #${value}`,
			});
		}
		return found;
	}, [query.data?.pages, value, valueLabel]);

	return (
		<SearchableSelect
			value={value ? String(value) : undefined}
			options={options}
			onValueChange={(next) => {
				const option = options.find((entry) => entry.value === next);
				onChange(Number(next), option?.label ?? `Item #${next}`);
			}}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder={placeholder}
			searchPlaceholder="Type SKU or name"
			emptyText={debounced ? "No items found." : "Type to search items."}
			isLoading={query.isFetching && debounced.length > 0}
			hasNextPage={query.hasNextPage}
			isFetchingNextPage={query.isFetchingNextPage}
			onReachEnd={() => query.fetchNextPage()}
		/>
	);
}
