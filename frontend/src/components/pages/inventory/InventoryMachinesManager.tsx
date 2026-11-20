"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconPlus } from "@tabler/icons-react";
import { type PaginationState, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { DataTable } from "@/components/common/DataTable";
import { DataTableColumnHeader } from "@/components/common/DataTableColumnHeader";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { todayIso } from "@/components/pages/inventory/inventory-format";
import {
	listEmptyState,
	listErrorState,
} from "@/components/pages/inventory/list-states";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
	useCreateMachineMutation,
	useMachinesQuery,
	useUpdateMachineMutation,
} from "@/lib/api/asset/queries";
import { formatDateTime } from "@/lib/format";
import {
	type AssetMachine,
	type AssetMachineCreatePayload,
	type AssetMachineStatus,
	assetMachineFormSchema,
	assetMachineStatusValues,
} from "@/types/asset";

type MachineModalState =
	| { open: false }
	| { open: true; mode: "create" }
	| { open: true; mode: "edit"; machine: AssetMachine };

const STATUS_LABEL: Record<AssetMachineStatus, string> = {
	idle: "Idle",
	running: "Running",
	maintenance: "Maintenance",
	breakdown: "Breakdown",
};

function toMachineOption(machine: AssetMachine): SearchableSelectOption {
	return {
		value: String(machine.id),
		label: machine.name,
		secondaryLabel: `${machine.type ?? "No type"} • ${STATUS_LABEL[machine.status]}`,
	};
}

function toMachinePayload(
	values: AssetMachineCreatePayload,
): AssetMachineCreatePayload {
	return {
		name: values.name.trim(),
		code: values.code.trim(),
		type: values.type?.trim() ? values.type.trim() : null,
		status: values.status ?? "idle",
		lastMaintenanceAt: values.lastMaintenanceAt?.trim()
			? values.lastMaintenanceAt.trim().slice(0, 10)
			: null,
	};
}

type MachineFormValues = AssetMachineCreatePayload & { isActive: boolean };

type MachineEditorFormProps = {
	mode: "create" | "edit";
	machine?: AssetMachine;
	onDone: () => void;
};

function MachineEditorForm({ mode, machine, onDone }: MachineEditorFormProps) {
	const createMachineMutation = useCreateMachineMutation();
	const updateMachineMutation = useUpdateMachineMutation();

	const isPending =
		mode === "create"
			? createMachineMutation.isPending
			: updateMachineMutation.isPending;

	const form = useForm<MachineFormValues>({
		resolver: zodResolver(assetMachineFormSchema),
		defaultValues:
			mode === "edit" && machine
				? {
						name: machine.name,
						code: machine.code ?? "",
						type: machine.type,
						status: machine.status,
						lastMaintenanceAt: machine.lastMaintenanceAt?.slice(0, 10) ?? null,
						isActive: machine.isActive,
					}
				: {
						name: "",
						code: "",
						type: null,
						status: "idle",
						lastMaintenanceAt: null,
						isActive: true,
					},
	});

	function onSubmit(values: MachineFormValues) {
		const payload = toMachinePayload(values);

		if (mode === "create") {
			createMachineMutation.mutate(payload, {
				onSuccess: () => onDone(),
			});
			return;
		}

		if (!machine) return;

		updateMachineMutation.mutate(
			{
				machineId: machine.id,
				payload: { ...payload, isActive: values.isActive },
			},
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
						<FormItem className="min-h-19 mt-2 gap-1.5">
							<FormLabel htmlFor="machine-name">Machine name</FormLabel>
							<FormControl>
								<Input {...field} id="machine-name" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="code"
					render={({ field }) => (
						<FormItem className="min-h-19 gap-1.5">
							<FormLabel htmlFor="machine-code">Machine code</FormLabel>
							<FormControl>
								<Input {...field} id="machine-code" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="type"
					render={({ field }) => (
						<FormItem className="min-h-19 gap-1.5">
							<FormLabel htmlFor="machine-type">Machine type</FormLabel>
							<FormControl>
								<Input
									id="machine-type"
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
					name="status"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Status</FormLabel>
							<Select
								value={field.value ?? "idle"}
								onValueChange={(value) =>
									field.onChange(value as AssetMachineStatus)
								}
							>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{assetMachineStatusValues.map((status) => (
										<SelectItem key={status} value={status}>
											{STATUS_LABEL[status]}
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
					name="lastMaintenanceAt"
					render={({ field }) => (
						<FormItem className="min-h-19 gap-1.5">
							<FormLabel htmlFor="machine-last-maintenance">
								Last maintenance date
							</FormLabel>
							<FormControl>
								<Input
									id="machine-last-maintenance"
									type="date"
									max={todayIso()}
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

				<Button className="w-full" type="submit" disabled={isPending}>
					{isPending
						? "Saving..."
						: mode === "create"
							? "Create machine"
							: "Update machine"}
				</Button>
			</form>
		</Form>
	);
}

export function InventoryMachinesManager() {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [searchValue, setSearchValue] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | AssetMachineStatus>(
		"all",
	);
	const [modal, setModal] = useState<MachineModalState>({ open: false });

	const debouncedSearch = useDebouncedValue(searchValue, 350);

	const machinesQuery = useMachinesQuery({
		page: pagination.pageIndex + 1,
		pageSize: pagination.pageSize,
		q: debouncedSearch || undefined,
		status: statusFilter === "all" ? undefined : statusFilter,
	});

	const machines = machinesQuery.data?.data ?? [];
	const meta = machinesQuery.data?.meta;

	const comboboxOptions = useMemo(
		() => machines.map(toMachineOption),
		[machines],
	);

	const columns = useMemo<DataTableColumnDef<AssetMachine>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Machine" />
				),
				cell: ({ row }) => (
					<Button
						type="button"
						variant="link"
						className="h-auto p-0"
						onClick={() =>
							setModal({ open: true, mode: "edit", machine: row.original })
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
				cell: ({ getValue }) => getValue<string | null>() || "—",
			},
			{
				accessorKey: "type",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Type" />
				),
				cell: ({ getValue }) => getValue<string | null>() || "—",
			},
			{
				accessorKey: "isActive",
				header: "Active",
				cell: ({ getValue }) => (
					<StatusBadge
						doc="machine"
						status={getValue<boolean>() ? "active" : "inactive"}
					/>
				),
			},
			{
				accessorKey: "status",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Status" />
				),
				cell: ({ getValue }) => {
					const status = getValue<AssetMachineStatus>();
					return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
				},
			},
			{
				accessorKey: "lastUpdatedAt",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Last Updated" />
				),
				cell: ({ getValue }) => {
					const value = getValue<string>();
					return formatDateTime(value);
				},
			},
		],
		[],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: machines,
		columns,
		manualPagination: true,
		pageCount: meta?.totalPages ?? 1,
		onPaginationChange: setPagination,
		state: { pagination },
	});

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Machines"
				description="Production machines and their status."
				actions={
					<Button onClick={() => setModal({ open: true, mode: "create" })}>
						<IconPlus className="size-3.5" />
						Create machine
					</Button>
				}
			/>
			<FilterBar value="" onChange={() => {}}>
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<div className="w-full sm:max-w-sm">
						<SearchableSelect
							value={
								modal.open && modal.mode === "edit"
									? String(modal.machine.id)
									: undefined
							}
							options={comboboxOptions}
							onValueChange={(value) => {
								const machine = machines.find(
									(entry) => entry.id === Number(value),
								);
								if (!machine) return;
								setModal({ open: true, mode: "edit", machine });
							}}
							searchValue={searchValue}
							onSearchChange={(value) => {
								setSearchValue(value);
								setPagination((prev) => ({ ...prev, pageIndex: 0 }));
							}}
							placeholder="Search machine"
							searchPlaceholder="Search machine"
							emptyText="No machines found"
							isLoading={machinesQuery.isLoading}
						/>
					</div>

					<Select
						value={statusFilter}
						onValueChange={(value) => {
							setStatusFilter(value as "all" | AssetMachineStatus);
							setPagination((prev) => ({ ...prev, pageIndex: 0 }));
						}}
					>
						<SelectTrigger className="w-full sm:w-44">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All statuses</SelectItem>
							{assetMachineStatusValues.map((status) => (
								<SelectItem key={status} value={status}>
									{STATUS_LABEL[status]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</FilterBar>

			<DataTable
				table={table}
				isLoading={machinesQuery.isLoading}
				emptyState={listEmptyState("No machines yet")}
				errorState={listErrorState(
					machinesQuery,
					"The list could not be loaded.",
				)}
			/>

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
									{modal.mode === "create" ? "Create machine" : "Edit machine"}
								</DialogTitle>
								<DialogDescription>
									{modal.mode === "create"
										? "Create new asset machine master."
										: "Update machine details."}
								</DialogDescription>
							</DialogHeader>

							<MachineEditorForm
								key={
									modal.mode === "edit"
										? `machine-${modal.machine.id}`
										: "machine-new"
								}
								mode={modal.mode}
								machine={modal.mode === "edit" ? modal.machine : undefined}
								onDone={() => setModal({ open: false })}
							/>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
