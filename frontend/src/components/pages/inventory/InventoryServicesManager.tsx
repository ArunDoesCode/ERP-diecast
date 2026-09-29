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
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useCreateServiceMutation,
	useServicesQuery,
	useUpdateServiceMutation,
} from "@/lib/api/asset/queries";
import {
	type AssetService,
	type AssetServiceCreatePayload,
	assetServiceFormSchema,
} from "@/types/asset";

type ServiceModalState =
	| { open: false }
	| { open: true; mode: "create" }
	| { open: true; mode: "edit"; service: AssetService };

function toServiceOption(service: AssetService): SearchableSelectOption {
	return {
		value: String(service.id),
		label: service.name,
		secondaryLabel: `${service.code} • ${service.defaultUom}`,
	};
}

type ServiceFormValues = AssetServiceCreatePayload & { isActive: boolean };

function toServicePayload(
	values: AssetServiceCreatePayload,
): AssetServiceCreatePayload {
	return {
		code: values.code.trim(),
		name: values.name.trim(),
		description: values.description?.trim() ? values.description.trim() : null,
		defaultUom: values.defaultUom.trim(),
		sacCode: values.sacCode?.trim() ? values.sacCode.trim() : null,
	};
}

type ServiceEditorFormProps = {
	mode: "create" | "edit";
	service?: AssetService;
	onDone: () => void;
};

function ServiceEditorForm({ mode, service, onDone }: ServiceEditorFormProps) {
	const createServiceMutation = useCreateServiceMutation();
	const updateServiceMutation = useUpdateServiceMutation();

	const isPending =
		mode === "create"
			? createServiceMutation.isPending
			: updateServiceMutation.isPending;

	const form = useForm<ServiceFormValues>({
		resolver: zodResolver(assetServiceFormSchema),
		defaultValues:
			mode === "edit" && service
				? {
						code: service.code,
						name: service.name,
						description: service.description,
						defaultUom: service.defaultUom,
						sacCode: service.sacCode,
						isActive: service.isActive,
					}
				: {
						code: "",
						name: "",
						description: null,
						defaultUom: "",
						sacCode: null,
						isActive: true,
					},
	});

	function onSubmit(values: ServiceFormValues) {
		const payload = toServicePayload(values);

		if (mode === "create") {
			createServiceMutation.mutate(payload, { onSuccess: onDone });
			return;
		}

		if (!service) return;
		updateServiceMutation.mutate(
			{
				serviceId: service.id,
				payload: { ...payload, isActive: values.isActive },
			},
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
						name="code"
						render={({ field }) => (
							<FormItem className="min-h-19 mt-2">
								<FormControl>
									<FloatingLabelInput
										{...field}
										id="service-code"
										label="Code"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem className="min-h-19 mt-2">
								<FormControl>
									<FloatingLabelInput
										{...field}
										id="service-name"
										label="Service name"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="defaultUom"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										{...field}
										id="service-uom"
										label="Default UOM"
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="sacCode"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="service-sac"
										label="SAC code (6 digits, starts 99)"
										inputMode="numeric"
										maxLength={6}
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
						name="description"
						render={({ field }) => (
							<FormItem className="min-h-19">
								<FormControl>
									<FloatingLabelInput
										id="service-description"
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
							? "Create service"
							: "Update service"}
				</Button>
			</form>
		</Form>
	);
}

export function InventoryServicesManager() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [searchValue, setSearchValue] = useState("");
	const [modal, setModal] = useState<ServiceModalState>({ open: false });

	const debouncedSearch = useDebouncedValue(searchValue, 350);

	const servicesQuery = useServicesQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		q: debouncedSearch || undefined,
	});

	const services = servicesQuery.data?.data ?? [];
	const meta = servicesQuery.data?.meta;

	const comboboxOptions = useMemo(
		() => services.map(toServiceOption),
		[services],
	);

	const columns = useMemo<ColumnDef<AssetService>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Service" />
				),
				cell: ({ row }) => (
					<Button
						type="button"
						variant="link"
						className="h-auto p-0"
						onClick={() =>
							setModal({ open: true, mode: "edit", service: row.original })
						}
					>
						{row.original.name}
					</Button>
				),
			},
			{
				accessorKey: "code",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Code" />
				),
			},
			{
				accessorKey: "defaultUom",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Default UOM" />
				),
			},
			{
				accessorKey: "sacCode",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="SAC" />
				),
				cell: ({ getValue }) => getValue<string | null>() || "—",
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
		data: services,
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
								? String(modal.service.id)
								: undefined
						}
						options={comboboxOptions}
						onValueChange={(value) => {
							const service = services.find(
								(entry) => entry.id === Number(value),
							);
							if (!service) return;
							setModal({ open: true, mode: "edit", service });
						}}
						searchValue={searchValue}
						onSearchChange={(value) => {
							setSearchValue(value);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
						placeholder="Search service"
						searchPlaceholder="Search service"
						emptyText="No services found"
						isLoading={servicesQuery.isLoading}
					/>
				</div>

				<Button onClick={() => setModal({ open: true, mode: "create" })}>
					<IconPlus className="size-3.5" />
					Create service
				</Button>
			</div>

			<DataTable table={table} isLoading={servicesQuery.isLoading} />

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
									{modal.mode === "create" ? "Create service" : "Edit service"}
								</DialogTitle>
								<DialogDescription>
									{modal.mode === "create"
										? "Create new inventory service."
										: "Update service details."}
								</DialogDescription>
							</DialogHeader>

							<ServiceEditorForm
								key={
									modal.mode === "edit"
										? `service-${modal.service.id}`
										: "service-new"
								}
								mode={modal.mode}
								service={modal.mode === "edit" ? modal.service : undefined}
								onDone={() => setModal({ open: false })}
							/>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
