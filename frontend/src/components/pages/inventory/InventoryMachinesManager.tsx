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
	useCreateMachineMutation,
	useMachinesQuery,
	useUpdateMachineMutation,
} from "@/lib/api/asset/queries";
import {
	type AssetMachine,
	type AssetMachineCreatePayload,
	type AssetMachineStatus,
	assetMachineCreateSchema,
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
		type: values.type?.trim() ? values.type.trim() : null,
		status: values.status ?? "idle",
		lastMaintenanceAt: values.lastMaintenanceAt?.trim()
			? values.lastMaintenanceAt.trim()
			: null,
	};
}

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

	const form = useForm<AssetMachineCreatePayload>({
		resolver: zodResolver(assetMachineCreateSchema),
		defaultValues:
			mode === "edit" && machine
				? {
						name: machine.name,
						type: machine.type,
						status: machine.status,
						lastMaintenanceAt: machine.lastMaintenanceAt,
					}
				: {
						name: "",
						type: null,
						status: "idle",
						lastMaintenanceAt: null,
					},
	});

	function onSubmit(values: AssetMachineCreatePayload) {
		const payload = toMachinePayload(values);

		if (mode === "create") {
			createMachineMutation.mutate(payload, {
				onSuccess: () => onDone(),
			});
			return;
		}

		if (!machine) return;

		updateMachineMutation.mutate(
			{ machineId: machine.id, payload },
			{
				onSuccess: () => onDone(),
			},
		);
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem className="min-h-19 mt-2">
							<FormControl>
								<FloatingLabelInput
									{...field}
									id="machine-name"
									label="Machine name"
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
							<FormControl>
								<FloatingLabelInput
									id="machine-type"
									label="Machine type"
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
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="machine-last-maintenance"
									label="Last maintenance (ISO date)"
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

	const columns = useMemo<ColumnDef<AssetMachine>[]>(
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
				accessorKey: "type",
				header: ({ column }) => (
					<DataTableColumnHeader column={column} title="Type" />
				),
				cell: ({ getValue }) => getValue<string | null>() || "—",
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
					return value ? new Date(value).toLocaleString() : "—";
				},
			},
		],
		[],
	);

	const table = useReactTable({
		data: machines,
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

				<Button onClick={() => setModal({ open: true, mode: "create" })}>
					<IconPlus className="size-3.5" />
					Create machine
				</Button>
			</div>

			<DataTable table={table} isLoading={machinesQuery.isLoading} />

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
