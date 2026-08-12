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
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useCreateItemMutation,
	useItemsQuery,
	useUpdateItemMutation,
} from "@/lib/api/asset/queries";
import {
	type AssetItem,
	type AssetItemCreatePayload,
	assetItemCreateSchema,
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

function toItemPayload(values: AssetItemCreatePayload): AssetItemCreatePayload {
	return {
		sku: values.sku.trim(),
		name: values.name.trim(),
		description: values.description?.trim() ? values.description.trim() : null,
		category: values.category.trim(),
		uom: values.uom.trim(),
		reorderLevel: values.reorderLevel,
		currentStock: values.currentStock,
		averageCostPaise: values.averageCostPaise,
		isActive: values.isActive,
	};
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

	const form = useForm<AssetItemCreatePayload>({
		resolver: zodResolver(assetItemCreateSchema),
		defaultValues:
			mode === "edit" && item
				? {
						sku: item.sku,
						name: item.name,
						description: item.description,
						category: item.category,
						uom: item.uom,
						reorderLevel: item.reorderLevel ?? undefined,
						currentStock: item.currentStock ?? undefined,
						averageCostPaise: item.averageCostPaise ?? undefined,
						isActive: item.isActive,
					}
				: {
						sku: "",
						name: "",
						description: null,
						category: "",
						uom: "",
						reorderLevel: undefined,
						currentStock: undefined,
						averageCostPaise: undefined,
						isActive: true,
					},
	});

	function onSubmit(values: AssetItemCreatePayload) {
		const payload = toItemPayload(values);

		if (mode === "create") {
			createItemMutation.mutate(payload, { onSuccess: onDone });
			return;
		}

		if (!item) return;
		updateItemMutation.mutate(
			{ itemId: item.id, payload },
			{ onSuccess: onDone },
		);
	}

	return (
		<Form {...form}>
			<form className="" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="isActive"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center justify-end gap-2 -translate-y-3.5">
							<FormLabel>Active</FormLabel>
							<FormControl>
								<Switch
									checked={field.value ?? false}
									onCheckedChange={field.onChange}
									aria-label="Toggle item active status"
								/>
							</FormControl>
						</FormItem>
					)}
				/>
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
								<FormControl>
									<FloatingLabelInput
										{...field}
										id="item-category"
										label="Category"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="uom"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput {...field} id="item-uom" label="UOM" />
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
						name="currentStock"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="item-current-stock"
										label="Current stock (optional)"
										type="number"
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
						name="averageCostPaise"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="item-average-cost"
										label="Average cost paise (optional)"
										type="number"
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
						name="description"
						render={({ field }) => (
							<FormItem className="min-h-19">
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
										: "Update item details."}
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
