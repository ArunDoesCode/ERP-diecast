import { IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { type Control, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	PRCreateFormInput,
	PREditFormInput,
} from "@/types/purchase-requisitions";

export type FormStep = "details" | "items";

export type ItemsFormShape = {
	items: Array<{
		uom?: string;
	}>;
};

export type LookupItemOption = {
	value: string;
	label: string;
	secondaryLabel?: string;
};

export function ItemUomCell({
	control,
	index,
}: {
	control: Control<ItemsFormShape>;
	index: number;
}) {
	const uom = useWatch({
		control,
		name: `items.${index}.uom`,
	});

	return (
		<TableCell className="text-sm text-muted-foreground">
			{uom || "N/A"}
		</TableCell>
	);
}

export function createDefaults(): PRCreateFormInput {
	return {
		type: "stock_reorder",
		assetId: undefined,
		notes: "",
		items: [
			{
				itemId: undefined as unknown as number,
				requestedQty: 1,
				uom: "",
			},
		],
	};
}

export function toEditDefaults(detail: {
	prId: number;
	status: PREditFormInput["status"];
	notes?: string | null;
	items: Array<{
		id: number;
		itemId: number;
		requestedQty: number;
		uom?: string | null;
		expectedDate?: string | null;
	}>;
}): PREditFormInput {
	return {
		prId: detail.prId,
		status: detail.status,
		notes: detail.notes ?? "",
		items:
			detail.items.length > 0
				? detail.items.map((item) => ({
						id: item.id,
						itemId: item.itemId,
						requestedQty: item.requestedQty,
						uom: item.uom ?? "",
						expectedDate: item.expectedDate
							? item.expectedDate.slice(0, 10)
							: "",
					}))
				: [
						{
							itemId: undefined as unknown as number,
							requestedQty: 1,
							uom: "",
							expectedDate: "",
						},
					],
	};
}

export function toLookupItemOptions(
	items: Array<{
		id: number;
		name: string;
		uom?: string | null;
		sku?: string | null;
	}>,
): LookupItemOption[] {
	return items.map((item) => ({
		value: String(item.id),
		label: item.name,
		secondaryLabel: `${item.uom ?? ""}${item.sku ? ` - ${item.sku}` : ""}`,
	}));
}

export function mergeLookupItemOptions(
	...lists: LookupItemOption[][]
): LookupItemOption[] {
	const dedup = new Map<string, LookupItemOption>();

	for (const list of lists) {
		for (const option of list) {
			dedup.set(option.value, option);
		}
	}

	return Array.from(dedup.values());
}

export function ItemRowsTable({
	rows,
	readOnly,
	onAdd,
	renderFields,
}: {
	rows: Array<{ id: string }>;
	readOnly: boolean;
	onAdd: () => void;
	renderFields: (index: number) => ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div className="flex justify-end">
				<Button
					type="button"
					variant="outline"
					onClick={onAdd}
					disabled={readOnly}
				>
					<IconPlus className="size-3.5" />
					Add item row
				</Button>
			</div>

			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-72">Item</TableHead>
							<TableHead className="w-32">Requested Qty</TableHead>
							<TableHead className="w-32">UOM</TableHead>
							<TableHead className="w-20 text-right">Action</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row, index) => (
							<TableRow key={row.id}>{renderFields(index)}</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{!readOnly ? null : (
				<p className="text-xs text-muted-foreground">
					This PR is no longer draft. All fields are read-only.
				</p>
			)}

			{rows.length > 1 ? (
				<p className="text-xs text-muted-foreground">Minimum 1 row required.</p>
			) : null}
		</div>
	);
}
