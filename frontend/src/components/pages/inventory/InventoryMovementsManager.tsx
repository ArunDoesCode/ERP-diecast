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
import {
	useCreateMovementMutation,
	useMovementsQuery,
} from "@/lib/api/asset/queries";
import {
	type AssetMovement,
	type AssetMovementCreatePayload,
	type AssetReferenceType,
	type AssetTransactionType,
	assetMovementCreateSchema,
	assetReferenceTypeValues,
	assetTransactionTypeValues,
} from "@/types/asset";

const REFERENCE_TYPE_LABEL: Record<AssetReferenceType, string> = {
	grn: "GRN",
	grn_bypass: "GRN bypass",
	pro: "PRO",
	sco_issue: "SCO issue",
	sco_receipt: "SCO receipt",
	job_order_issue: "Job order issue",
	scrap_dispatch: "Scrap dispatch",
	stock_adjustment: "Stock adjustment",
};

const TRANSACTION_TYPE_LABEL: Record<AssetTransactionType, string> = {
	in: "In",
	out: "Out",
	adjustment: "Adjustment",
};

function toItemOption(movement: AssetMovement): SearchableSelectOption {
	return {
		value: String(movement.itemId),
		label: movement.itemName,
		secondaryLabel: `${movement.itemSku} • ${movement.itemUom}`,
	};
}

function toMovementPayload(
	values: AssetMovementCreatePayload,
): AssetMovementCreatePayload {
	return {
		itemId: values.itemId,
		locationId: values.locationId,
		batchNumber: values.batchNumber?.trim() ? values.batchNumber.trim() : null,
		transactionType: values.transactionType,
		referenceType: values.referenceType,
		referenceId: values.referenceId,
		quantityChange: values.quantityChange,
		unitCostPaise: values.unitCostPaise,
		notes: values.notes?.trim() ? values.notes.trim() : null,
	};
}

type MovementCreateFormProps = {
	onDone: () => void;
};

function MovementCreateForm({ onDone }: MovementCreateFormProps) {
	const createMovementMutation = useCreateMovementMutation();

	const form = useForm<AssetMovementCreatePayload>({
		resolver: zodResolver(assetMovementCreateSchema),
		defaultValues: {
			itemId: 0,
			locationId: 0,
			batchNumber: null,
			transactionType: "in",
			referenceType: "grn",
			referenceId: 0,
			quantityChange: 0,
			unitCostPaise: 0,
			notes: null,
		},
	});

	function onSubmit(values: AssetMovementCreatePayload) {
		createMovementMutation.mutate(toMovementPayload(values), {
			onSuccess: () => onDone(),
		});
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="itemId"
					render={({ field }) => (
						<FormItem className="min-h-19 mt-2">
							<FormControl>
								<FloatingLabelInput
									id="movement-item-id"
									label="Item ID"
									type="number"
									name={field.name}
									value={field.value}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(event.target.valueAsNumber)
									}
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
							<FormControl>
								<FloatingLabelInput
									id="movement-location-id"
									label="Location ID"
									type="number"
									name={field.name}
									value={field.value}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(event.target.valueAsNumber)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="transactionType"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Transaction type</FormLabel>
							<Select
								value={field.value}
								onValueChange={(value) =>
									field.onChange(value as AssetTransactionType)
								}
							>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select transaction type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{assetTransactionTypeValues.map((type) => (
										<SelectItem key={type} value={type}>
											{TRANSACTION_TYPE_LABEL[type]}
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
					name="referenceType"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Reference type</FormLabel>
							<Select
								value={field.value}
								onValueChange={(value) =>
									field.onChange(value as AssetReferenceType)
								}
							>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select reference type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{assetReferenceTypeValues.map((type) => (
										<SelectItem key={type} value={type}>
											{REFERENCE_TYPE_LABEL[type]}
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
					name="referenceId"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-reference-id"
									label="Reference ID"
									type="number"
									name={field.name}
									value={field.value}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(event.target.valueAsNumber)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="quantityChange"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-quantity-change"
									label="Quantity change"
									type="number"
									name={field.name}
									value={field.value}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(event.target.valueAsNumber)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="unitCostPaise"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-unit-cost"
									label="Unit cost (paise)"
									type="number"
									name={field.name}
									value={field.value}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(event.target.valueAsNumber)
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
					name="notes"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="movement-notes"
									label="Notes (optional)"
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

				<Button
					className="w-full"
					type="submit"
					disabled={createMovementMutation.isPending}
				>
					{createMovementMutation.isPending ? "Saving..." : "Create movement"}
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
	const [comboboxSearch, setComboboxSearch] = useState("");
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

	const itemOptions = useMemo(() => {
		const filtered = movements.filter((movement) => {
			if (!comboboxSearch.trim()) return true;
			const query = comboboxSearch.toLowerCase();
			return (
				movement.itemName.toLowerCase().includes(query) ||
				movement.itemSku.toLowerCase().includes(query)
			);
		});

		const dedup = new Map<string, SearchableSelectOption>();
		for (const movement of filtered) {
			dedup.set(String(movement.itemId), toItemOption(movement));
		}
		return Array.from(dedup.values());
	}, [movements, comboboxSearch]);

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
						<SearchableSelect
							value={selectedItemId ? String(selectedItemId) : undefined}
							options={itemOptions}
							onValueChange={(value) => {
								setSelectedItemId(Number(value));
								setPagination((prev) => ({ ...prev, pageIndex: 0 }));
							}}
							searchValue={comboboxSearch}
							onSearchChange={setComboboxSearch}
							placeholder="Filter by item"
							searchPlaceholder="Search item from current page"
							emptyText="No items found"
							isLoading={movementsQuery.isLoading}
						/>
					</div>

					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setSelectedItemId(undefined);
							setComboboxSearch("");
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
					>
						Clear
					</Button>
				</div>

				<Button onClick={() => setCreateOpen(true)}>
					<IconPlus className="size-3.5" />
					Create movement
				</Button>
			</div>

			<DataTable table={table} isLoading={movementsQuery.isLoading} />

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Create movement</DialogTitle>
						<DialogDescription>
							Create inventory movement entry.
						</DialogDescription>
					</DialogHeader>

					<MovementCreateForm onDone={() => setCreateOpen(false)} />
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
						<DialogTitle>Edit movement</DialogTitle>
						<DialogDescription>
							Read-only edit modal. Update endpoint is not available in API
							contract.
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
								<span className="font-medium">Reference:</span>{" "}
								{REFERENCE_TYPE_LABEL[detailMovement.referenceType]} #
								{detailMovement.referenceId}
							</p>
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
