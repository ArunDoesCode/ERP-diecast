"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconPlus } from "@tabler/icons-react";
import {
	type ColumnDef,
	getCoreRowModel,
	type PaginationState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { InventoryBackButton } from "@/components/pages/inventory/InventoryBackButton";
import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { FloatingLabelInput } from "@/components/ui/floating-label";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useCreateItemMutation,
	useItemsQuery,
	useUpdateItemMutation,
} from "@/lib/api/asset/queries";
import {
	type AssetItem,
	type AssetItemCategory,
	type AssetItemCreatePayload,
	type AssetItemFormValues,
	type AssetItemUom,
	type AssetItemUpdatePayload,
	assetItemCategoryValues,
	assetItemFormSchema,
	assetItemUomValues,
} from "@/types/asset";

type ItemModalState =
	| { open: false }
	| { open: true; mode: "create" }
	| { open: true; mode: "edit"; item: AssetItem };

function toItemOption(item: AssetItem): SearchableSelectOption {
	return {
		value: String(item.id),
		label: item.name,
		secondaryLabel: `${item.sku} • ${item.uom}`,
	};
}

function buildItemWirePayload(
	values: AssetItemFormValues,
): AssetItemCreatePayload {
	return {
		sku: values.sku.trim(),
		name: values.name.trim(),
		description: values.description?.trim() ? values.description.trim() : null,
		category: values.category,
		uom: values.uom,
		reorderLevel: values.reorderLevel,
		standardRatePaise: Math.round(values.standardRate * 100),
	};
}

// Edit sends only what changed, so an unchanged SKU/UOM never trips ITEM_IN_USE.
function toUpdatePayload(
	values: AssetItemFormValues,
	item: AssetItem,
): AssetItemUpdatePayload {
	const next = buildItemWirePayload(values);
	const payload: AssetItemUpdatePayload = {};
	if (next.sku !== item.sku) payload.sku = next.sku;
	if (next.name !== item.name) payload.name = next.name;
	if (next.description !== (item.description ?? null))
		payload.description = next.description;
	if (next.category !== item.category) payload.category = next.category;
	if (next.uom !== item.uom) payload.uom = next.uom;
	if (
		next.reorderLevel !== undefined &&
		next.reorderLevel !== (item.reorderLevel ?? undefined)
	)
		payload.reorderLevel = next.reorderLevel;
	if (next.standardRatePaise !== item.standardRatePaise)
		payload.standardRatePaise = next.standardRatePaise;
	const nextHsn = values.hsnCode?.trim() ? values.hsnCode.trim() : null;
	if (nextHsn !== (item.hsnCode ?? null)) payload.hsnCode = nextHsn;
	if (values.isActive !== item.isActive) payload.isActive = values.isActive;
	return payload;
}

function asCategory(value: string): AssetItemCategory | undefined {
	return (assetItemCategoryValues as readonly string[]).includes(value)
		? (value as AssetItemCategory)
		: undefined;
}

function asUom(value: string): AssetItemUom | undefined {
	return (assetItemUomValues as readonly string[]).includes(value)
		? (value as AssetItemUom)
		: undefined;
}

type ItemEditorFormProps = {
	mode: "create" | "edit";
	item?: AssetItem;
	onDone: () => void;
};

function ItemEditorForm({ mode, item, onDone }: ItemEditorFormProps) {
	const createItemMutation = useCreateItemMutation();
	const updateItemMutation = useUpdateItemMutation();

	const isPending =
		mode === "create"
			? createItemMutation.isPending
			: updateItemMutation.isPending;

	const form = useForm<AssetItemFormValues>({
		resolver: zodResolver(assetItemFormSchema),
		defaultValues:
			mode === "edit" && item
				? {
						sku: item.sku,
						name: item.name,
						description: item.description,
						category: asCategory(item.category),
						uom: asUom(item.uom),
						reorderLevel: item.reorderLevel ?? undefined,
						standardRate:
							item.standardRatePaise > 0
								? item.standardRatePaise / 100
								: undefined,
						isActive: item.isActive,
						hsnCode: item.hsnCode ?? "",
					}
				: {
						sku: "",
						name: "",
						description: null,
						category: undefined,
						uom: undefined,
						reorderLevel: undefined,
						standardRate: undefined,
						isActive: true,
					},
	});

	function onSubmit(values: AssetItemFormValues) {
		if (mode === "create") {
			createItemMutation.mutate(buildItemWirePayload(values), {
				onSuccess: onDone,
			});
			return;
		}

		if (!item) return;
		const payload = toUpdatePayload(values, item);
		if (Object.keys(payload).length === 0) {
			onDone();
			return;
		}
		updateItemMutation.mutate(
			{ itemId: item.id, payload },
			{ onSuccess: onDone },
		);
	}

	return (
		<Form {...form}>
			<form className="" onSubmit={form.handleSubmit(onSubmit)}>
				{mode === "edit" ? (
					<FormField
						control={form.control}
						name="isActive"
						render={({ field }) => (
							<FormItem className="flex flex-row items-center justify-end gap-2 -translate-y-3.5">
								<FormLabel>Active</FormLabel>
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				) : null}
				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="sku"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput {...field} id="item-sku" label="SKU" />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										{...field}
										id="item-name"
										label="Item name"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="category"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormLabel>Category</FormLabel>
								<Select
									value={field.value ?? ""}
									onValueChange={field.onChange}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select category" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{assetItemCategoryValues.map((category) => (
											<SelectItem key={category} value={category}>
												{category}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="uom"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormLabel>Unit</FormLabel>
								<Select
									value={field.value ?? ""}
									onValueChange={field.onChange}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select unit" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{assetItemUomValues.map((uom) => (
											<SelectItem key={uom} value={uom}>
												{uom}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="standardRate"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="item-standard-rate"
										label="Standard rate (₹)"
										type="number"
										step="0.01"
										min="0"
										name={field.name}
										value={field.value ?? ""}
										onBlur={field.onBlur}
										ref={field.ref}
										onChange={(event) => {
											const value = event.target.value;
											field.onChange(
												value === "" ? undefined : event.target.valueAsNumber,
											);
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="reorderLevel"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="item-reorder-level"
										label="Reorder level (optional)"
										type="number"
										step="0.001"
										min="0"
										name={field.name}
										value={field.value ?? ""}
										onBlur={field.onBlur}
										ref={field.ref}
										onChange={(event) => {
											const value = event.target.value;
											field.onChange(
												value === "" ? undefined : event.target.valueAsNumber,
											);
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					{mode === "edit" && item ? (
						<div className="col-span-2 grid grid-cols-2 gap-3 text-sm">
							<div>
								<p className="text-xs font-medium text-muted-foreground">
									Current stock (read-only)
								</p>
								<p>
									{item.currentStock ?? 0} {item.uom}
								</p>
							</div>
							<div>
								<p className="text-xs font-medium text-muted-foreground">
									Average cost (read-only)
								</p>
								<p>{formatPaise(item.averageCostPaise)}</p>
							</div>
						</div>
					) : null}

					{mode === "edit" ? (
						<FormField
							control={form.control}
							name="hsnCode"
							render={({ field }) => (
								<FormItem className="col-span-2 min-h-19">
									<FormControl>
										<FloatingLabelInput
											id="item-hsn-code"
											label="HSN code (optional)"
											maxLength={20}
											name={field.name}
											value={field.value ?? ""}
											onBlur={field.onBlur}
											ref={field.ref}
											onChange={(event) => field.onChange(event.target.value)}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					) : null}

					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
							<FormItem className="col-span-2 min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="item-description"
										label="Description (optional)"
										name={field.name}
										value={field.value ?? ""}
										onBlur={field.onBlur}
										ref={field.ref}
										onChange={(event) =>
											field.onChange(event.target.value || null)
										}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				<Button className="w-full" type="submit" disabled={isPending}>
					{isPending
						? "Saving..."
						: mode === "create"
							? "Create item"
							: "Update item"}
				</Button>
			</form>
		</Form>
	);
}

export function InventoryItemsManager() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [searchValue, setSearchValue] = useState("");
	const [modal, setModal] = useState<ItemModalState>({ open: false });

	const debouncedSearch = useDebouncedValue(searchValue, 350);

	const itemsQuery = useItemsQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		q: debouncedSearch || undefined,
	});

	const items = itemsQuery.data?.data ?? [];
	const meta = itemsQuery.data?.meta;

	const comboboxOptions = useMemo(() => items.map(toItemOption), [items]);

	const columns = useMemo<ColumnDef<AssetItem>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Item" />
				),
				cell: ({ row }) => (
					<Button
						type="button"
						variant="link"
						className="h-auto p-0"
						onClick={() =>
							setModal({ open: true, mode: "edit", item: row.original })
						}
					>
						{row.original.name}
					</Button>
				),
			},
			{
				accessorKey: "sku",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="SKU" />
				),
			},
			{
				accessorKey: "uom",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="UOM" />
				),
			},
			{
				accessorKey: "category",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Category" />
				),
				cell: ({ getValue }) => getValue<string | null>() || "—",
			},
			{
				accessorKey: "currentStock",
				header: "Stock",
				cell: ({ row }) =>
					`${row.original.currentStock ?? 0} ${row.original.uom}`,
			},
			{
				accessorKey: "standardRatePaise",
				header: "Std rate",
				cell: ({ getValue }) => formatPaise(getValue<number>()),
			},
			{
				accessorKey: "isActive",
				header: "Status",
				cell: ({ getValue }) =>
					getValue<boolean>() ? (
						<Badge variant="secondary">Active</Badge>
					) : (
						<Badge variant="outline">Inactive</Badge>
					),
			},
		],
		[],
	);

	const table = useReactTable({
		data: items,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		pageCount: meta?.totalPages ?? 1,
		onPaginationChange: setPagination,
		state: { pagination },
	});

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<InventoryBackButton />
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="w-full sm:max-w-sm">
					<SearchableSelect
						value={
							modal.open && modal.mode === "edit"
								? String(modal.item.id)
								: undefined
						}
						options={comboboxOptions}
						onValueChange={(value) => {
							const item = items.find((entry) => entry.id === Number(value));
							if (!item) return;
							setModal({ open: true, mode: "edit", item });
						}}
						searchValue={searchValue}
						onSearchChange={(value) => {
							setSearchValue(value);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
						placeholder="Search item"
						searchPlaceholder="Search item"
						emptyText="No items found"
						isLoading={itemsQuery.isLoading}
					/>
				</div>

				<Button onClick={() => setModal({ open: true, mode: "create" })}>
					<IconPlus className="size-3.5" />
					Create item
				</Button>
			</div>

			<DataTable table={table} isLoading={itemsQuery.isLoading} />

			<Dialog
				open={modal.open}
				onOpenChange={(open) => {
					if (!open) setModal({ open: false });
				}}
			>
				<DialogContent className="min-w-2xl">
					{modal.open ? (
						<>
							<DialogHeader>
								<DialogTitle>
									{modal.mode === "create" ? "Create item" : "Edit item"}
								</DialogTitle>
								<DialogDescription>
									{modal.mode === "create"
										? "Create new inventory item."
										: "Update item details. SKU and unit cannot change once the item is used."}
								</DialogDescription>
							</DialogHeader>

							<ItemEditorForm
								key={
									modal.mode === "edit" ? `item-${modal.item.id}` : "item-new"
								}
								mode={modal.mode}
								item={modal.mode === "edit" ? modal.item : undefined}
								onDone={() => setModal({ open: false })}
							/>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
