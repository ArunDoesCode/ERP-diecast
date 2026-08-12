"use client";

import { IconPlus } from "@tabler/icons-react";

import { SupplierItemsOfferingsPane } from "@/components/pages/suppliers/SupplierItemsOfferingsPane";
import { SupplierOfferingsDialog } from "@/components/pages/suppliers/SupplierOfferingsDialog";
import { SupplierServicesOfferingsPane } from "@/components/pages/suppliers/SupplierServicesOfferingsPane";
import { useSupplierOfferingsState } from "@/components/pages/suppliers/use-supplier-offerings-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

export function SupplierOfferingsSection({
	supplierId,
}: {
	supplierId: number;
}) {
	const {
		dialogState,
		itemsPage,
		offeringsSearch,
		offeringsTab,
		pageSize,
		servicesPage,
		onDialogOpenChange,
		onPageSizeChange,
		onSearchChange,
		onTabChange,
		openCreateDialog,
		openEditItemDialog,
		openEditServiceDialog,
		setItemsPage,
		setServicesPage,
	} = useSupplierOfferingsState();

	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<CardTitle>Supplier offerings</CardTitle>
					<Tabs
						value={offeringsTab}
						onValueChange={(value) =>
							onTabChange(value as "items" | "services")
						}
					>
						<TabsList>
							<TabsTrigger value="items">Items supplied</TabsTrigger>
							<TabsTrigger value="services">Services provided</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<div className="flex w-full items-center gap-2 sm:w-auto">
					<div className="w-full sm:w-64">
						<Input
							value={offeringsSearch}
							onChange={(event) => onSearchChange(event.target.value)}
							placeholder={
								offeringsTab === "items"
									? "Search item offerings"
									: "Search service offerings"
							}
						/>
					</div>

					<Select
						value={String(pageSize)}
						onValueChange={(value) => onPageSizeChange(Number(value))}
					>
						<SelectTrigger className="w-24">
							<SelectValue placeholder="Rows" />
						</SelectTrigger>
						<SelectContent>
							{PAGE_SIZE_OPTIONS.map((option) => (
								<SelectItem key={option} value={String(option)}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Button type="button" onClick={openCreateDialog}>
						<IconPlus className="size-3.5" />
						{offeringsTab === "items" ? "Add item" : "Add service"}
					</Button>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{offeringsTab === "items" ? (
					<SupplierItemsOfferingsPane
						supplierId={supplierId}
						active={offeringsTab === "items"}
						search={offeringsSearch}
						page={itemsPage}
						pageSize={pageSize}
						onPageChange={setItemsPage}
						onEdit={openEditItemDialog}
					/>
				) : (
					<SupplierServicesOfferingsPane
						supplierId={supplierId}
						active={offeringsTab === "services"}
						search={offeringsSearch}
						page={servicesPage}
						pageSize={pageSize}
						onPageChange={setServicesPage}
						onEdit={openEditServiceDialog}
					/>
				)}
			</CardContent>

			<SupplierOfferingsDialog
				supplierId={supplierId}
				state={dialogState}
				onOpenChange={onDialogOpenChange}
			/>
		</Card>
	);
}
