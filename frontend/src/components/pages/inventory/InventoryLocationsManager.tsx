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
import { Checkbox } from "@/components/ui/checkbox";
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
	useCreateLocationMutation,
	useLocationsQuery,
	useUpdateLocationMutation,
} from "@/lib/api/asset/queries";
import { useSuppliersQuery } from "@/lib/api/suppliers/queries";
import {
	type AssetLocation,
	type AssetLocationCreatePayload,
	type AssetLocationType,
	type AssetLocationUpdatePayload,
	assetLocationFormSchema,
	assetLocationTypeValues,
} from "@/types/asset";

type LocationModalState =
	| { open: false }
	| { open: true; mode: "create" }
	| { open: true; mode: "edit"; location: AssetLocation };

const TYPE_LABEL: Record<AssetLocationType, string> = {
	main_store: "Main store",
	vendor_premise: "Vendor premise",
	finished_goods: "Finished goods",
	scrap_yard: "Scrap yard",
};

function toLocationOption(location: AssetLocation): SearchableSelectOption {
	return {
		value: String(location.id),
		label: location.name,
		secondaryLabel: TYPE_LABEL[location.type],
	};
}

type LocationFormValues = AssetLocationCreatePayload & { isActive: boolean };

function buildLocationPayload(
	values: LocationFormValues,
): AssetLocationCreatePayload {
	const isVendor = values.type === "vendor_premise";
	return {
		name: values.name.trim(),
		type: values.type,
		...(isVendor ? {} : { isVirtual: values.isVirtual ?? false }),
		linkedVendorId: isVendor ? (values.linkedVendorId ?? null) : null,
	};
}

// Edit sends only what changed, so an unchanged type/supplier never trips LOCATION_IN_USE.
function buildLocationUpdate(
	values: LocationFormValues,
	location: AssetLocation,
): AssetLocationUpdatePayload {
	const next = buildLocationPayload(values);
	const payload: AssetLocationUpdatePayload = {};
	if (next.name !== location.name) payload.name = next.name;
	if (next.type !== location.type) payload.type = next.type;
	if (next.isVirtual !== undefined && next.isVirtual !== location.isVirtual)
		payload.isVirtual = next.isVirtual;
	if ((next.linkedVendorId ?? null) !== location.linkedVendorId)
		payload.linkedVendorId = next.linkedVendorId ?? null;
	if (values.isActive !== location.isActive) payload.isActive = values.isActive;
	return payload;
}

function SupplierPicker({
	value,
	onChange,
}: {
	value: number | null | undefined;
	onChange: (supplierId: number | null) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 350);
	const suppliersQuery = useSuppliersQuery({
		q: debounced || undefined,
		page: 1,
		pageSize: 20,
		sortBy: "name",
		sortDir: "asc",
	});

	const options = useMemo(() => {
		const list: SearchableSelectOption[] = (
			suppliersQuery.data?.data ?? []
		).map((supplier) => ({
			value: String(supplier.id),
			label: supplier.name,
		}));
		if (value && !list.some((option) => option.value === String(value))) {
			list.unshift({ value: String(value), label: `Supplier #${value}` });
		}
		return list;
	}, [suppliersQuery.data, value]);

	return (
		<SearchableSelect
			value={value ? String(value) : undefined}
			options={options}
			onValueChange={(next) => onChange(Number(next))}
			searchValue={search}
			onSearchChange={setSearch}
			placeholder="Select supplier"
			searchPlaceholder="Search supplier"
			emptyText="No suppliers found"
			isLoading={suppliersQuery.isLoading}
		/>
	);
}

type LocationEditorFormProps = {
	mode: "create" | "edit";
	location?: AssetLocation;
	onDone: () => void;
};

function LocationEditorForm({
	mode,
	location,
	onDone,
}: LocationEditorFormProps) {
	const createLocationMutation = useCreateLocationMutation();
	const updateLocationMutation = useUpdateLocationMutation();

	const isPending =
		mode === "create"
			? createLocationMutation.isPending
			: updateLocationMutation.isPending;

	const form = useForm<LocationFormValues>({
		resolver: zodResolver(assetLocationFormSchema),
		defaultValues:
			mode === "edit" && location
				? {
						name: location.name,
						type: location.type,
						isVirtual: location.isVirtual,
						linkedVendorId: location.linkedVendorId,
						isActive: location.isActive,
					}
				: {
						name: "",
						type: "main_store",
						isVirtual: false,
						linkedVendorId: null,
						isActive: true,
					},
	});

	const selectedType = form.watch("type");

	function onSubmit(values: LocationFormValues) {
		if (mode === "create") {
			createLocationMutation.mutate(buildLocationPayload(values), {
				onSuccess: () => onDone(),
			});
			return;
		}

		if (!location) return;
		const payload = buildLocationUpdate(values, location);
		if (Object.keys(payload).length === 0) {
			onDone();
			return;
		}

		updateLocationMutation.mutate(
			{ locationId: location.id, payload },
			{
				onSuccess: () => onDone(),
			},
		);
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				{mode === "edit" ? (
					<FormField
						control={form.control}
						name="isActive"
						render={({ field }) => (
							<FormItem className="flex flex-row items-center justify-end gap-2">
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
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem className="min-h-19 mt-2">
							<FormControl>
								<FloatingLabelInput
									{...field}
									id="location-name"
									label="Location name"
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="type"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Location type</FormLabel>
							<Select
								value={field.value}
								onValueChange={(value) =>
									field.onChange(value as AssetLocationType)
								}
							>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select location type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{assetLocationTypeValues.map((type) => (
										<SelectItem key={type} value={type}>
											{TYPE_LABEL[type]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				{selectedType === "vendor_premise" ? (
					<FormField
						control={form.control}
						name="linkedVendorId"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormLabel>Supplier</FormLabel>
								<FormControl>
									<SupplierPicker
										value={field.value}
										onChange={field.onChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				) : (
					<FormField
						control={form.control}
						name="isVirtual"
						render={({ field }) => (
							<FormItem className="min-h-19 flex flex-row items-center justify-between rounded-md border px-3 py-2">
								<FormLabel>Virtual location</FormLabel>
								<FormControl>
									<Checkbox
										checked={field.value ?? false}
										onCheckedChange={(checked) =>
											field.onChange(checked === true)
										}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				)}

				<Button className="w-full" type="submit" disabled={isPending}>
					{isPending
						? "Saving..."
						: mode === "create"
							? "Create location"
							: "Update location"}
				</Button>
			</form>
		</Form>
	);
}

export function InventoryLocationsManager() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [searchValue, setSearchValue] = useState("");
	const [modal, setModal] = useState<LocationModalState>({ open: false });

	const debouncedSearch = useDebouncedValue(searchValue, 350);

	const locationsQuery = useLocationsQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		q: debouncedSearch || undefined,
	});

	const locations = locationsQuery.data?.data ?? [];
	const meta = locationsQuery.data?.meta;

	const comboboxOptions = useMemo(
		() => locations.map(toLocationOption),
		[locations],
	);

	const columns = useMemo<ColumnDef<AssetLocation>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Location" />
				),
				cell: ({ row }) => (
					<Button
						type="button"
						variant="link"
						className="h-auto p-0"
						onClick={() =>
							setModal({ open: true, mode: "edit", location: row.original })
						}
					>
						{row.original.name}
					</Button>
				),
			},
			{
				accessorKey: "type",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Type" />
				),
				cell: ({ getValue }) => {
					const type = getValue<AssetLocationType>();
					return <Badge variant="secondary">{TYPE_LABEL[type]}</Badge>;
				},
			},
			{
				accessorKey: "isVirtual",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Virtual" />
				),
				cell: ({ getValue }) =>
					getValue<boolean>() ? (
						<Badge variant="outline">Yes</Badge>
					) : (
						<Badge variant="secondary">No</Badge>
					),
			},
			{
				accessorKey: "linkedVendorId",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Linked Vendor" />
				),
				cell: ({ getValue }) => getValue<number | null>() ?? "—",
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
		data: locations,
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
								? String(modal.location.id)
								: undefined
						}
						options={comboboxOptions}
						onValueChange={(value) => {
							const location = locations.find(
								(entry) => entry.id === Number(value),
							);
							if (!location) return;
							setModal({ open: true, mode: "edit", location });
						}}
						searchValue={searchValue}
						onSearchChange={(value) => {
							setSearchValue(value);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
						placeholder="Search location"
						searchPlaceholder="Search location"
						emptyText="No locations found"
						isLoading={locationsQuery.isLoading}
					/>
				</div>

				<Button onClick={() => setModal({ open: true, mode: "create" })}>
					<IconPlus className="size-3.5" />
					Create location
				</Button>
			</div>

			<DataTable table={table} isLoading={locationsQuery.isLoading} />

			<Dialog
				open={modal.open}
				onOpenChange={(open) => {
					if (!open) setModal({ open: false });
				}}
			>
				<DialogContent className="sm:max-w-lg">
					{modal.open ? (
						<>
							<DialogHeader>
								<DialogTitle>
									{modal.mode === "create"
										? "Create location"
										: "Edit location"}
								</DialogTitle>
								<DialogDescription>
									{modal.mode === "create"
										? "Create new inventory location."
										: "Update location details."}
								</DialogDescription>
							</DialogHeader>

							<LocationEditorForm
								key={
									modal.mode === "edit"
										? `location-${modal.location.id}`
										: "location-new"
								}
								mode={modal.mode}
								location={modal.mode === "edit" ? modal.location : undefined}
								onDone={() => setModal({ open: false })}
							/>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
