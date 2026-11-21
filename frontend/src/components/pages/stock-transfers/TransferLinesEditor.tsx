"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { transferQtyError } from "@/components/pages/stock-transfers/transfer-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useItemsQuery } from "@/lib/api/asset/queries";
import { formatQty } from "@/lib/format";
import { ST_MAX_LINES } from "@/types/stock-transfer";

export type TransferRow = {
	key: string;
	itemId: number | null;
	/** "SKU · name", kept so a picked item still shows when it is not in the search results. */
	label: string;
	unit: string | null;
	qty: string;
};

/** Available at the source for one row: number, or null when not known yet. */
export type BalanceLookup = (row: TransferRow) => number | null;

function ItemPicker({
	id,
	row,
	usedIds,
	disabled,
	onPick,
}: {
	id: string;
	row: TransferRow;
	usedIds: Set<number>;
	disabled: boolean;
	onPick: (itemId: number, label: string, unit: string) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 300);
	const query = useItemsQuery({
		page: 1,
		pageSize: 20,
		q: debounced.trim() || undefined,
		isActive: true,
	});

	const options = useMemo(() => {
		const found: SearchableSelectOption[] = (query.data?.data ?? []).map(
			(item) => ({
				value: String(item.id),
				label: `${item.sku} · ${item.name}`,
				secondaryLabel: item.uom,
				disabled: usedIds.has(item.id) && item.id !== row.itemId,
			}),
		);
		if (row.itemId && !found.some((o) => o.value === String(row.itemId))) {
			found.unshift({ value: String(row.itemId), label: row.label });
		}
		return found;
	}, [query.data, usedIds, row.itemId, row.label]);

	return (
		<SearchableSelect
			id={id}
			value={row.itemId ? String(row.itemId) : undefined}
			options={options}
			disabled={disabled}
			onValueChange={(next) => {
				const item = (query.data?.data ?? []).find(
					(entry) => String(entry.id) === next,
				);
				if (item) onPick(item.id, `${item.sku} · ${item.name}`, item.uom);
			}}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder="Select item"
			searchPlaceholder="Type SKU or name"
			emptyText="No items found."
			isLoading={query.isFetching && !query.data}
			className="min-w-0 [&>span]:truncate"
		/>
	);
}

export function TransferLinesEditor({
	rows,
	sourceName,
	balanceOf,
	lineErrors,
	showErrors,
	disabled,
	onPick,
	onQtyChange,
	onRemove,
	onAdd,
}: {
	rows: TransferRow[];
	sourceName: string | null;
	balanceOf: BalanceLookup;
	/** Server errors by row key. */
	lineErrors: Record<string, string>;
	showErrors: boolean;
	disabled: boolean;
	onPick: (key: string, itemId: number, label: string, unit: string) => void;
	onQtyChange: (key: string, qty: string) => void;
	onRemove: (key: string) => void;
	onAdd: () => void;
}) {
	const usedIds = useMemo(
		() =>
			new Set(
				rows.map((row) => row.itemId).filter((id): id is number => id !== null),
			),
		[rows],
	);

	return (
		<div className="flex flex-col gap-3">
			<div
				aria-hidden="true"
				className="hidden grid-cols-[minmax(0,1fr)_minmax(0,13rem)_9rem_2.25rem] gap-x-3 border-b bg-table-header px-3 py-2 text-[13px] font-medium text-muted-foreground lg:grid"
			>
				<span>Item</span>
				<span>Available at source</span>
				<span className="text-right">Qty</span>
				<span />
			</div>
			<ul className="flex flex-col gap-3 lg:gap-1">
				{rows.map((row, index) => {
					const number = index + 1;
					const itemId = `st-item-${row.key}`;
					const qtyId = `st-qty-${row.key}`;
					const availId = `st-avail-${row.key}`;
					const available = row.itemId ? balanceOf(row) : null;
					const qtyNumber = Number(row.qty);
					const qtyProblem =
						lineErrors[row.key] ??
						(showErrors && row.itemId === null
							? "Pick an item"
							: row.qty.trim() !== "" || showErrors
								? transferQtyError(row.qty, row.unit)
								: null);
					const over =
						available !== null &&
						Number.isFinite(qtyNumber) &&
						qtyNumber > available;
					return (
						<li
							key={row.key}
							className="grid gap-x-3 gap-y-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_9rem_2.25rem] lg:items-start lg:rounded-none lg:border-0 lg:p-0 lg:px-3 lg:py-1"
						>
							<div className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-1">
								<label
									htmlFor={itemId}
									className="text-sm font-medium lg:sr-only"
								>
									Item (line {number})
								</label>
								<ItemPicker
									id={itemId}
									row={row}
									usedIds={usedIds}
									disabled={disabled}
									onPick={(pickedId, label, unit) =>
										onPick(row.key, pickedId, label, unit)
									}
								/>
							</div>
							<div className="min-w-0 space-y-1">
								<label
									htmlFor={availId}
									className="text-sm font-medium lg:sr-only"
								>
									Available at source
								</label>
								<output
									id={availId}
									className={`flex min-h-9 items-center text-sm ${over ? "text-warning" : "text-muted-foreground"}`}
								>
									{row.itemId && available !== null && sourceName
										? over
											? `Only ${formatQty(available, row.unit, 3)} at ${sourceName}`
											: `${formatQty(available, row.unit, 3)} at ${sourceName}`
										: "–"}
								</output>
							</div>
							<div className="min-w-0 space-y-1">
								<label
									htmlFor={qtyId}
									className="text-sm font-medium lg:sr-only"
								>
									Qty (line {number})
								</label>
								<div className="flex items-center gap-2">
									<Input
										id={qtyId}
										inputMode="decimal"
										value={row.qty}
										disabled={disabled}
										aria-invalid={qtyProblem ? true : undefined}
										aria-describedby={qtyProblem ? `${qtyId}-error` : undefined}
										className="min-w-0 flex-1 text-right tabular-nums"
										onChange={(event) =>
											onQtyChange(row.key, event.target.value)
										}
									/>
									<span className="w-8 shrink-0 text-sm text-muted-foreground">
										{row.unit ?? ""}
									</span>
								</div>
							</div>
							<div className="flex items-start justify-end sm:col-span-2 lg:col-span-1">
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label={`Remove line ${number}`}
									disabled={disabled || rows.length <= 1}
									onClick={() => onRemove(row.key)}
								>
									<IconTrash />
								</Button>
							</div>
							{qtyProblem ? (
								<p
									id={`${qtyId}-error`}
									className="text-[13px] text-destructive sm:col-span-2 lg:col-span-4"
								>
									Line {number}: {qtyProblem}
								</p>
							) : null}
						</li>
					);
				})}
			</ul>
			<div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={disabled || rows.length >= ST_MAX_LINES}
					onClick={onAdd}
				>
					<IconPlus />
					Add line
				</Button>
			</div>
		</div>
	);
}
