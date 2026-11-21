"use client";

import { useMemo, useState } from "react";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAssetItemsLookupQuery } from "@/lib/api/suppliers/queries";
import type { AssetItemOption } from "@/types/suppliers";

/** Active item picker for a sale order line; hands back the whole item (unit is needed). */
export function SoItemPicker({
	value,
	valueLabel,
	onChange,
}: {
	value?: number;
	valueLabel?: string;
	onChange: (item: AssetItemOption) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 300);
	const query = useAssetItemsLookupQuery(debounced, 20);
	const items = useMemo(
		() => query.data?.pages.flatMap((page) => page.data) ?? [],
		[query.data?.pages],
	);

	const options = useMemo(() => {
		const found: SearchableSelectOption[] = items.map((item) => ({
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
	}, [items, value, valueLabel]);

	return (
		<SearchableSelect
			value={value ? String(value) : undefined}
			options={options}
			onValueChange={(next) => {
				const item = items.find((entry) => String(entry.id) === next);
				if (item) onChange(item);
			}}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder="Pick an item"
			searchPlaceholder="Type SKU or name"
			emptyText={debounced ? "No items found." : "Type to search items."}
			isLoading={query.isFetching && debounced.length > 0}
			hasNextPage={query.hasNextPage}
			isFetchingNextPage={query.isFetchingNextPage}
			onReachEnd={() => query.fetchNextPage()}
		/>
	);
}
