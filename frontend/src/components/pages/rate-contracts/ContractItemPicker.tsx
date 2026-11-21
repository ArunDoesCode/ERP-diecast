"use client";

import { useMemo, useState } from "react";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAssetItemsLookupQuery } from "@/lib/api/suppliers/queries";
import type { AssetItemOption } from "@/types/suppliers";

/** Active item select; gives the item back so the row can show its uom. */
export function ContractItemPicker({
	id,
	value,
	valueLabel,
	exclude,
	onChange,
}: {
	id?: string;
	value?: number;
	valueLabel?: string;
	exclude?: number[];
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
		const found: SearchableSelectOption[] = items
			.filter((item) => !exclude?.includes(item.id) || item.id === value)
			.map((item) => ({
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
	}, [items, exclude, value, valueLabel]);

	return (
		<SearchableSelect
			id={id}
			value={value ? String(value) : undefined}
			options={options}
			onValueChange={(next) => {
				const found = items.find((item) => String(item.id) === next);
				if (found) onChange(found);
			}}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder="Select item"
			searchPlaceholder="Type SKU or name"
			emptyText={debounced ? "No items found." : "Type to search items."}
			isLoading={query.isFetching && debounced.length > 0}
			hasNextPage={query.hasNextPage}
			isFetchingNextPage={query.isFetchingNextPage}
			onReachEnd={() => query.fetchNextPage()}
		/>
	);
}
