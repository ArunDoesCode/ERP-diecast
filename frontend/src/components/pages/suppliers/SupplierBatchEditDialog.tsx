"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	getBatchFailures,
	useEditSupplierItemMutation,
	useEditSupplierServiceMutation,
} from "@/lib/api/suppliers/queries";
import {
	GST_SLABS,
	paiseToRupees,
	rupeesToPaise,
	type SupplierItem,
	type SupplierService,
} from "@/types/suppliers";

import type { OfferingsTab } from "./use-supplier-offerings-state";

const MAX_BATCH_ROWS = 100;
const MAX_PRICE_PAISE = 2147483647;

type DraftRow = {
	id: number;
	name: string;
	priceRupees: string;
	tax: number;
	leadTimeDays: string;
	isActive: boolean;
};

function toDraftRows(
	tab: OfferingsTab,
	items: SupplierItem[],
	services: SupplierService[],
): DraftRow[] {
	if (tab === "items") {
		return items.map((item) => ({
			id: item.id,
			name: item.itemName,
			priceRupees: paiseToRupees(item.supplierUnitPricePaise),
			tax: item.taxPercentage ?? 0,
			leadTimeDays: String(item.leadTimeDays ?? 0),
			isActive: item.isActive,
		}));
	}
	return services.map((service) => ({
		id: service.id,
		name: service.serviceName,
		priceRupees: paiseToRupees(service.serviceUnitPricePaise),
		tax: service.taxPercentage ?? 0,
		leadTimeDays: String(service.leadTimeDays ?? 0),
		isActive: service.isActive,
	}));
}

function validateRow(row: DraftRow): string | null {
	if (!/^\d+(\.\d{1,2})?$/.test(row.priceRupees.trim())) {
		return "Price must be in rupees, up to 2 decimals";
	}
	const paise = rupeesToPaise(row.priceRupees.trim());
	if (paise < 1 || paise > MAX_PRICE_PAISE)
		return "Price must be at least 0.01";
	const lead = Number(row.leadTimeDays);
	if (!Number.isInteger(lead) || lead < 0 || lead > 365) {
		return "Lead time must be 0 to 365 days";
	}
	return null;
}

export function SupplierBatchEditDialog({
	supplierId,
	tab,
	items,
	services,
	onClose,
}: {
	supplierId: number;
	tab: OfferingsTab;
	items: SupplierItem[];
	services: SupplierService[];
	onClose: () => void;
}) {
	const originals = toDraftRows(tab, items, services).slice(0, MAX_BATCH_ROWS);
	const [drafts, setDrafts] = useState<DraftRow[]>(originals);
	const [failures, setFailures] = useState<Map<number, string>>(new Map());

	const editItems = useEditSupplierItemMutation();
	const editServices = useEditSupplierServiceMutation();
	const isSaving = editItems.isPending || editServices.isPending;

	function update(id: number, patch: Partial<DraftRow>) {
		setDrafts((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);
	}

	function changedRows() {
		return drafts.filter((draft) => {
			const original = originals.find((row) => row.id === draft.id);
			return (
				original &&
				(original.priceRupees !== draft.priceRupees ||
					original.tax !== draft.tax ||
					original.leadTimeDays !== draft.leadTimeDays ||
					original.isActive !== draft.isActive)
			);
		});
	}

	function handleSave() {
		const changed = changedRows();
		if (changed.length === 0) {
			toast.error("Nothing changed");
			return;
		}
		for (const row of changed) {
			const problem = validateRow(row);
			if (problem) {
				toast.error(`${row.name}: ${problem}`);
				return;
			}
		}

		setFailures(new Map());
		const onError = (error: unknown) => {
			const next = new Map<number, string>();
			for (const failure of getBatchFailures(error)) {
				const row = changed[failure.index];
				if (row) next.set(row.id, failure.error ?? "Could not be saved");
			}
			setFailures(next);
		};
		const onSuccess = () => onClose();

		if (tab === "items") {
			editItems.mutate(
				{
					supplierId,
					payload: changed.map((row) => ({
						supplierItemsId: row.id,
						supplierUnitPricePaise: rupeesToPaise(row.priceRupees.trim()),
						taxPercentage: row.tax,
						leadTimeDays: Number(row.leadTimeDays),
						isActive: row.isActive,
					})),
				},
				{ onSuccess, onError },
			);
			return;
		}
		editServices.mutate(
			{
				supplierId,
				payload: changed.map((row) => ({
					supplierServiceId: row.id,
					serviceUnitPricePaise: rupeesToPaise(row.priceRupees.trim()),
					taxPercentage: row.tax,
					leadTimeDays: Number(row.leadTimeDays),
					isActive: row.isActive,
				})),
			},
			{ onSuccess, onError },
		);
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>
						Edit {tab === "items" ? "item" : "service"} prices
					</DialogTitle>
					<DialogDescription>
						Change price, GST %, lead time or status for up to {MAX_BATCH_ROWS}{" "}
						rows. If any row fails, nothing is saved.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[60vh] overflow-y-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{tab === "items" ? "Item" : "Service"}</TableHead>
								<TableHead>Price (&#8377;)</TableHead>
								<TableHead>GST %</TableHead>
								<TableHead>Lead days</TableHead>
								<TableHead>Active</TableHead>
								<TableHead>Result</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{drafts.map((row) => (
								<TableRow key={row.id}>
									<TableCell>{row.name}</TableCell>
									<TableCell>
										<Input
											aria-label={`Price for ${row.name}`}
											inputMode="decimal"
											className="w-28"
											value={row.priceRupees}
											onChange={(event) =>
												update(row.id, { priceRupees: event.target.value })
											}
										/>
									</TableCell>
									<TableCell>
										<Select
											value={String(row.tax)}
											onValueChange={(value) =>
												update(row.id, { tax: Number(value) })
											}
										>
											<SelectTrigger
												className="w-24"
												aria-label={`GST % for ${row.name}`}
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{GST_SLABS.map((slab) => (
													<SelectItem key={slab} value={String(slab)}>
														{slab}%
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell>
										<Input
											aria-label={`Lead days for ${row.name}`}
											type="number"
											min={0}
											max={365}
											className="w-24"
											value={row.leadTimeDays}
											onChange={(event) =>
												update(row.id, { leadTimeDays: event.target.value })
											}
										/>
									</TableCell>
									<TableCell>
										<Switch
											checked={row.isActive}
											onCheckedChange={(checked) =>
												update(row.id, { isActive: checked })
											}
											aria-label={`Active for ${row.name}`}
										/>
									</TableCell>
									<TableCell className="text-xs text-destructive">
										{failures.get(row.id) ?? ""}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button type="button" disabled={isSaving} onClick={handleSave}>
						{isSaving ? "Saving..." : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
