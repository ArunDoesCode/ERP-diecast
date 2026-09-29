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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useCreateMovementMutation,
	useItemsQuery,
	useLocationsQuery,
	useMovementsQuery,
} from "@/lib/api/asset/queries";
import {
	type AssetMovement,
	type AssetMovementCreatePayload,
	type AssetMovementFormValues,
	type AssetReferenceType,
	type AssetTransactionType,
	assetManualReferenceTypeValues,
	assetMovementFormSchema,
} from "@/types/asset";

const REFERENCE_TYPE_LABEL: Record<AssetReferenceType, string> = {
	grn: "GRN",
	grn_bypass: "GRN bypass",
	grn_correction: "GRN correction",
	opening_stock: "Opening stock",
	sco_loss: "SCO loss",
	pro: "PRO",
	sco_issue: "SCO issue",
	sco_receipt: "SCO receipt",
	job_order_issue: "Job order issue",
	scrap_dispatch: "Scrap dispatch",
	stock_adjustment: "Stock-take",
};

const MANUAL_REFERENCE_LABEL = {
	stock_adjustment: "Stock-take",
	opening_stock: "Opening stock",
} as const;

const TRANSACTION_TYPE_LABEL: Record<AssetTransactionType, string> = {
	in: "In",
	out: "Out",
	adjustment: "Adjustment",
};

function sourceLabel(movement: AssetMovement) {
	const label = REFERENCE_TYPE_LABEL[movement.referenceType];
	const source = movement.sourceDocument;
	if (!source || source.id === 0) return `${label} (manual)`;
	return `${label} ${source.number ?? `#${source.id}`}`;
}

function toMovementPayload(
	values: AssetMovementFormValues,
): AssetMovementCreatePayload {
	const batchNumber = values.batchNumber?.trim()
		? values.batchNumber.trim()
		: null;
	const unitCostPaise =
		values.unitCost === undefined
			? undefined
			: Math.round(values.unitCost * 100);

	if (values.referenceType === "opening_stock") {
		return {
			itemId: values.itemId,
			locationId: values.locationId,
			referenceType: "opening_stock",
			qty: values.quantity,
			unitCostPaise: unitCostPaise ?? 0,
			reason: values.reason.trim(),
			batchNumber,
		};
	}

	return {
		itemId: values.itemId,
		locationId: values.locationId,
		referenceType: "stock_adjustment",
		countedQty: values.quantity,
		unitCostPaise,
		reason: values.reason.trim(),
		batchNumber,
	};
}

function ItemPicker({
	value,
	onChange,
	placeholder,
}: {
	value: number | undefined;
	onChange: (itemId: number) => void;
	placeholder: string;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 350);
	const itemsQuery = useItemsQuery({
		page: 1,
		pageSize: 20,
		q: debounced || undefined,
	});

	const options = useMemo(() => {
		const list: SearchableSelectOption[] = (itemsQuery.data?.data ?? []).map(
			(item) => ({
				value: String(item.id),
				label: item.name,
				secondaryLabel: `${item.sku} • ${item.uom}${item.isActive ? "" : " • inactive"}`,
			}),
		);
		if (value && !list.some((option) => option.value === String(value))) {
			list.unshift({ value: String(value), label: `Item #${value}` });
		}
		return list;
	}, [itemsQuery.data, value]);

	return (
		<SearchableSelect
			value={value ? String(value) : undefined}
			options={options}
			onValueChange={(next) => onChange(Number(next))}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder={placeholder}
			searchPlaceholder="Search item"
			emptyText="No items found"
			isLoading={itemsQuery.isLoading}
		/>
	);
}

function LocationPicker({
	value,
	onChange,
}: {
	value: number | undefined;
	onChange: (locationId: number) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 350);
	const locationsQuery = useLocationsQuery({
		page: 1,
		pageSize: 20,
		q: debounced || undefined,
		isActive: true,
	});

	const options = useMemo(() => {
		const list: SearchableSelectOption[] = (
			locationsQuery.data?.data ?? []
		).map((location) => ({
			value: String(location.id),
			label: location.name,
		}));
		if (value && !list.some((option) => option.value === String(value))) {
			list.unshift({ value: String(value), label: `Location #${value}` });
		}
		return list;
	}, [locationsQuery.data, value]);

	return (
		<SearchableSelect
			value={value ? String(value) : undefined}
			options={options}
			onValueChange={(next) => onChange(Number(next))}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder="Select location"
			searchPlaceholder="Search location"
			emptyText="No locations found"
			isLoading={locationsQuery.isLoading}
		/>
	);
}

type MovementCreateFormProps = {
	onDone: () => void;
};

function MovementCreateForm({ onDone }: MovementCreateFormProps) {
	const createMovementMutation = useCreateMovementMutation();

	const form = useForm<AssetMovementFormValues>({
		resolver: zodResolver(assetMovementFormSchema),
		defaultValues: {
			referenceType: "stock_adjustment",
			itemId: undefined,
			locationId: undefined,
			quantity: undefined,
			unitCost: undefined,
			batchNumber: null,
			reason: "",
		},
	});

	const referenceType = form.watch("referenceType");
	const isOpening = referenceType === "opening_stock";

	function onSubmit(values: AssetMovementFormValues) {
		createMovementMutation.mutate(toMovementPayload(values), {
			onSuccess: () => onDone(),
		});
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="referenceType"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Movement type</FormLabel>
							<Select
								value={field.value}
								onValueChange={(value) =>
									field.onChange(value as AssetReferenceType)
								}
							>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select movement type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{assetManualReferenceTypeValues.map((type) => (
										<SelectItem key={type} value={type}>
											{MANUAL_REFERENCE_LABEL[type]}
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
					name="itemId"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Item</FormLabel>
							<FormControl>
								<ItemPicker
									value={field.value}
									onChange={field.onChange}
									placeholder="Select item"
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="locationId"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Location</FormLabel>
							<FormControl>
								<LocationPicker value={field.value} onChange={field.onChange} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="quantity"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-quantity"
									label={isOpening ? "Opening quantity" : "Counted quantity"}
									type="number"
									step="0.001"
									min="0"
									name={field.name}
									value={field.value ?? ""}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(
											event.target.value === ""
												? undefined
												: event.target.valueAsNumber,
										)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="unitCost"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-unit-cost"
									label={
										isOpening
											? "Rate per unit (₹)"
											: "Cost per unit (₹) - needed if counted is more than balance"
									}
									type="number"
									step="0.01"
									min="0"
									name={field.name}
									value={field.value ?? ""}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(
											event.target.value === ""
												? undefined
												: event.target.valueAsNumber,
										)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="batchNumber"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-batch-number"
									label="Batch number (optional)"
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

				<FormField
					control={form.control}
					name="reason"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-reason"
									label="Reason"
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

				<Button
					className="w-full"
					type="submit"
					disabled={createMovementMutation.isPending}
				>
					{createMovementMutation.isPending
						? "Saving..."
						: isOpening
							? "Post opening stock"
							: "Post stock-take"}
				</Button>
			</form>
		</Form>
	);
}

export function InventoryMovementsManager() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [selectedItemId, setSelectedItemId] = useState<number | undefined>();
	const [createOpen, setCreateOpen] = useState(false);
	const [detailMovement, setDetailMovement] = useState<AssetMovement | null>(
		null,
	);

	const movementsQuery = useMovementsQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		itemId: selectedItemId,
	});

	const movements = movementsQuery.data?.data ?? [];
	const meta = movementsQuery.data?.meta;

	const columns = useMemo<ColumnDef<AssetMovement>[]>(
		() => [
			{
				accessorKey: "itemName",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Item" />
				),
				cell: ({ row }) => (
					<Button
						type="button"
						variant="link"
						className="h-auto p-0"
						onClick={() => setDetailMovement(row.original)}
					>
						{row.original.itemName}
					</Button>
				),
			},
			{
				accessorKey: "locationName",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Location" />
				),
			},
			{
				accessorKey: "transactionType",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Type" />
				),
				cell: ({ getValue }) => {
					const type = getValue<AssetTransactionType>();
					return (
						<Badge variant="secondary">{TRANSACTION_TYPE_LABEL[type]}</Badge>
					);
				},
			},
			{
				id: "source",
				header: "Source",
				cell: ({ row }) => sourceLabel(row.original),
			},
			{
				accessorKey: "quantityChange",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Qty Change" />
				),
			},
			{
				accessorKey: "createdAt",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Created" />
				),
				cell: ({ getValue }) => {
					const value = getValue<string>();
					return value ? new Date(value).toLocaleString() : "—";
				},
			},
		],
		[],
	);

	const table = useReactTable({
		data: movements,
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
				<div className="flex w-full gap-2 sm:max-w-lg">
					<div className="flex-1">
						<ItemPicker
							value={selectedItemId}
							onChange={(itemId) => {
								setSelectedItemId(itemId);
								setPagination((prev) => ({ ...prev, pageIndex: 0 }));
							}}
							placeholder="Filter by item"
						/>
					</div>

					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setSelectedItemId(undefined);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
					>
						Clear
					</Button>
				</div>

				<Button onClick={() => setCreateOpen(true)}>
					<IconPlus className="size-3.5" />
					Stock-take / opening stock
				</Button>
			</div>

			<DataTable table={table} isLoading={movementsQuery.isLoading} />

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Manual stock entry</DialogTitle>
						<DialogDescription>
							Stock-take posts the difference between your count and the current
							balance. Opening stock is only for an item and location with no
							movements yet.
						</DialogDescription>
					</DialogHeader>

					{createOpen ? (
						<MovementCreateForm onDone={() => setCreateOpen(false)} />
					) : null}
				</DialogContent>
			</Dialog>

			<Dialog
				open={detailMovement !== null}
				onOpenChange={(open) => {
					if (!open) setDetailMovement(null);
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Movement details</DialogTitle>
						<DialogDescription>
							Stock movements are read-only and cannot be edited.
						</DialogDescription>
					</DialogHeader>

					{detailMovement ? (
						<div className="space-y-2 text-sm">
							<p>
								<span className="font-medium">Item:</span>{" "}
								{detailMovement.itemName} ({detailMovement.itemSku})
							</p>
							<p>
								<span className="font-medium">Location:</span>{" "}
								{detailMovement.locationName}
							</p>
							<p>
								<span className="font-medium">Transaction:</span>{" "}
								{TRANSACTION_TYPE_LABEL[detailMovement.transactionType]}
							</p>
							<p>
								<span className="font-medium">Source:</span>{" "}
								{sourceLabel(detailMovement)}
							</p>
							{detailMovement.notes ? (
								<p>
									<span className="font-medium">Reason / notes:</span>{" "}
									{detailMovement.notes}
								</p>
							) : null}
							<p>
								<span className="font-medium">Quantity Change:</span>{" "}
								{detailMovement.quantityChange}
							</p>
							<p>
								<span className="font-medium">Balance After:</span>{" "}
								{detailMovement.balanceAfter}
							</p>
							<p>
								<span className="font-medium">Created:</span>{" "}
								{new Date(detailMovement.createdAt).toLocaleString()}
							</p>
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
