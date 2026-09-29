"use client";

import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { SearchableSelect } from "@/components/common/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableHead } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSuppliersQuery } from "@/lib/api/suppliers/queries";
import type { Supplier } from "@/types/suppliers";

const ALL_VENDORS = "all";

/** Vendor picker for report filters; "All vendors" clears the filter. */
export function VendorFilter({
	value,
	onChange,
}: {
	value: number | undefined;
	onChange: (vendorId: number | undefined) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 300);
	const query = useSuppliersQuery({
		page: 1,
		pageSize: 50,
		sortBy: "name",
		sortDir: "asc",
		q: debounced || undefined,
	});
	const options = useMemo(
		() => [
			{ value: ALL_VENDORS, label: "All vendors" },
			...(query.data?.data ?? [])
				.filter(
					(supplier: Supplier) =>
						supplier.type === "service_provider" || supplier.type === "both",
				)
				.map((supplier: Supplier) => ({
					value: String(supplier.id),
					label: supplier.name,
				})),
		],
		[query.data?.data],
	);

	return (
		<div className="w-full sm:w-64">
			<span className="mb-1 block text-xs font-medium">Vendor</span>
			<SearchableSelect
				value={value ? String(value) : ALL_VENDORS}
				options={options}
				onValueChange={(next) =>
					onChange(next === ALL_VENDORS ? undefined : Number(next))
				}
				searchValue={search}
				onSearchChange={setSearch}
				placeholder="All vendors"
				searchPlaceholder="Search vendors"
				emptyText="No vendors found."
				isLoading={query.isLoading}
			/>
		</div>
	);
}

export function DateRangeFilter({
	idPrefix,
	from,
	to,
	onChange,
}: {
	idPrefix: string;
	from: string;
	to: string;
	onChange: (range: { from: string; to: string }) => void;
}) {
	return (
		<div className="flex flex-wrap items-end gap-3">
			<div>
				<Label htmlFor={`${idPrefix}-from`}>From</Label>
				<Input
					id={`${idPrefix}-from`}
					type="date"
					value={from}
					max={to || undefined}
					onChange={(event) => onChange({ from: event.target.value, to })}
				/>
			</div>
			<div>
				<Label htmlFor={`${idPrefix}-to`}>To</Label>
				<Input
					id={`${idPrefix}-to`}
					type="date"
					value={to}
					min={from || undefined}
					onChange={(event) => onChange({ from, to: event.target.value })}
				/>
			</div>
		</div>
	);
}

export function SortableHead<T extends string>({
	label,
	field,
	sortBy,
	sortDir,
	onSort,
	className,
}: {
	label: string;
	field: T;
	sortBy: T;
	sortDir: "asc" | "desc";
	onSort: (field: T) => void;
	className?: string;
}) {
	const active = sortBy === field;
	return (
		<TableHead
			className={className}
			aria-sort={
				active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
			}
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="-ml-2 h-7 px-2"
				onClick={() => onSort(field)}
			>
				{label}
				{active ? (
					sortDir === "asc" ? (
						<IconArrowUp className="size-3" />
					) : (
						<IconArrowDown className="size-3" />
					)
				) : null}
			</Button>
		</TableHead>
	);
}
