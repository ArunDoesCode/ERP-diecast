"use client";

import { IconX } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useSupplierDetailQuery,
	useSuppliersQuery,
} from "@/lib/api/suppliers/queries";
import type { Supplier } from "@/types/suppliers";

/** Active-supplier select with server search. `exclude` hides suppliers already chosen. */
export function SupplierPicker({
	id,
	value,
	valueLabel,
	placeholder = "Select supplier",
	exclude,
	disabled,
	onChange,
}: {
	id?: string;
	value?: number;
	valueLabel?: string;
	placeholder?: string;
	exclude?: number[];
	disabled?: boolean;
	onChange: (
		supplier: Pick<Supplier, "id" | "name" | "defaultPaymentTermsDays">,
	) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 300);
	const query = useSuppliersQuery({
		status: "active",
		page: 1,
		pageSize: 50,
		q: debounced.trim() || undefined,
		sortBy: "name",
		sortDir: "asc",
	});
	const suppliers = useMemo(() => query.data?.data ?? [], [query.data]);

	const options = useMemo(() => {
		const found: SearchableSelectOption[] = suppliers
			.filter((supplier) => !exclude?.includes(supplier.id))
			.map((supplier) => ({
				value: String(supplier.id),
				label: supplier.name,
			}));
		if (value && !found.some((option) => option.value === String(value))) {
			found.unshift({
				value: String(value),
				label: valueLabel ?? `Supplier #${value}`,
			});
		}
		return found;
	}, [suppliers, exclude, value, valueLabel]);

	return (
		<SearchableSelect
			id={id}
			value={value ? String(value) : undefined}
			options={options}
			disabled={disabled}
			onValueChange={(next) => {
				const found = suppliers.find((s) => String(s.id) === next);
				onChange(
					found ?? {
						id: Number(next),
						name: valueLabel ?? `Supplier #${next}`,
						defaultPaymentTermsDays: null,
					},
				);
			}}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder={placeholder}
			searchPlaceholder="Type supplier name"
			emptyText="No active suppliers found."
			isLoading={query.isLoading}
		/>
	);
}

/** Supplier filter for a list bar: a picker with a clear button; the label of a URL value comes from the supplier record. */
export function SupplierFilter({
	value,
	onChange,
}: {
	value?: number;
	onChange: (supplierId: number | undefined) => void;
}) {
	const detail = useSupplierDetailQuery(value ?? 0);
	return (
		<div className="flex w-56 items-center gap-1">
			<SupplierPicker
				value={value}
				valueLabel={
					detail.data?.success ? detail.data.data.supplier.name : undefined
				}
				placeholder="All suppliers"
				onChange={(supplier) => onChange(supplier.id)}
			/>
			{value ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Clear supplier filter"
					onClick={() => onChange(undefined)}
				>
					<IconX />
				</Button>
			) : null}
		</div>
	);
}
