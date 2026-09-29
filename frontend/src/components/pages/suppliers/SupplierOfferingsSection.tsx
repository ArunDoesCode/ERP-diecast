"use client";

import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";

import { SupplierBatchEditDialog } from "@/components/pages/suppliers/SupplierBatchEditDialog";
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
import {
	useSupplierItemsQuery,
	useSupplierServicesQuery,
} from "@/lib/api/suppliers/queries";

const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

export function SupplierOfferingsSection({
	supplierId,
	canManage,
}: {
	supplierId: number;
	canManage: boolean;
}) {
	const [batchOpen, setBatchOpen] = useState(false);
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

	// Same keys as the panes, so these read the panes' cache (no extra request).
	const itemsQuery = useSupplierItemsQuery(
		supplierId,
		{ page: itemsPage, pageSize, q: offeringsSearch || undefined },
		offeringsTab === "items",
	);
	const servicesQuery = useSupplierServicesQuery(
		supplierId,
		{ page: servicesPage, pageSize, q: offeringsSearch || undefined },
		offeringsTab === "services",
	);
	const items = itemsQuery.data?.data ?? [];
	const services = servicesQuery.data?.data ?? [];
	const batchRowCount =
		offeringsTab === "items" ? items.length : services.length;

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

					{canManage ? (
						<>
							<Button
								type="button"
								variant="outline"
								disabled={batchRowCount === 0}
								onClick={() => setBatchOpen(true)}
							>
								Edit prices
							</Button>
							<Button type="button" onClick={openCreateDialog}>
								<IconPlus className="size-3.5" />
								{offeringsTab === "items" ? "Add item" : "Add service"}
							</Button>
						</>
					) : null}
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
						canManage={canManage}
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
						canManage={canManage}
					/>
				)}
			</CardContent>

			{batchOpen ? (
				<SupplierBatchEditDialog
					supplierId={supplierId}
					tab={offeringsTab}
					items={items}
					services={services}
					onClose={() => setBatchOpen(false)}
				/>
			) : null}

			<SupplierOfferingsDialog
				supplierId={supplierId}
				state={dialogState}
				onOpenChange={onDialogOpenChange}
			/>
		</Card>
	);
}
