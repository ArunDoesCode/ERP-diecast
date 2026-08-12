"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";

import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	useAssetItemsLookupQuery,
	useAssetServicesLookupQuery,
	useCreateSupplierItemMutation,
	useCreateSupplierServiceMutation,
	useEditSupplierItemMutation,
	useEditSupplierServiceMutation,
} from "@/lib/api/suppliers/queries";
import {
	type SupplierItem,
	type SupplierItemInput,
	type SupplierService,
	type SupplierServiceInput,
	supplierItemInputSchema,
	supplierServiceInputSchema,
} from "@/types/suppliers";

import type {
	OfferingsDialogState,
	OfferingsTab,
} from "./use-supplier-offerings-state";

const LOOKUP_PAGE_SIZE = 20;

function toItemInput(item?: SupplierItem): SupplierItemInput {
	if (!item) {
		return {
			supplierItemsId: undefined,
			itemId: undefined,
			supplierSku: "",
			supplierUnitPricePaise: 0,
			taxPercentage: undefined,
			leadTimeDays: undefined,
			qty: undefined,
			uom: "",
			isActive: true,
		};
	}

	return {
		supplierItemsId: item.id,
		itemId: item.itemId,
		supplierSku: item.supplierSku ?? "",
		supplierUnitPricePaise: item.supplierUnitPricePaise,
		taxPercentage: item.taxPercentage ?? undefined,
		leadTimeDays: item.leadTimeDays ?? undefined,
		qty: item.qty ?? undefined,
		uom: item.uom,
		isActive: item.isActive,
	};
}

function toServiceInput(service?: SupplierService): SupplierServiceInput {
	if (!service) {
		return {
			supplierServiceId: undefined,
			serviceId: undefined,
			serviceUnitPricePaise: 0,
			taxPercentage: undefined,
			leadTimeDays: undefined,
			isActive: true,
		};
	}

	return {
		supplierServiceId: service.id,
		serviceId: service.serviceId,
		serviceUnitPricePaise: service.serviceUnitPricePaise,
		taxPercentage: service.taxPercentage ?? undefined,
		leadTimeDays: service.leadTimeDays ?? undefined,
		isActive: service.isActive,
	};
}

export function SupplierOfferingsDialog({
	supplierId,
	state,
	onOpenChange,
}: {
	supplierId: number;
	state: OfferingsDialogState;
	onOpenChange: (open: boolean) => void;
}) {
	const isEditItem = Boolean(state.item);
	const isEditService = Boolean(state.service);
	const lockTab = isEditItem || isEditService;
	const [activeTab, setActiveTab] = useState<OfferingsTab>(state.tab);
	const [itemLookupSearch, setItemLookupSearch] = useState("");
	const [serviceLookupSearch, setServiceLookupSearch] = useState("");

	const itemLookupQuery = useAssetItemsLookupQuery(
		itemLookupSearch,
		LOOKUP_PAGE_SIZE,
	);
	const serviceLookupQuery = useAssetServicesLookupQuery(
		serviceLookupSearch,
		LOOKUP_PAGE_SIZE,
	);
	const createItemMutation = useCreateSupplierItemMutation();
	const editItemMutation = useEditSupplierItemMutation();
	const createServiceMutation = useCreateSupplierServiceMutation();
	const editServiceMutation = useEditSupplierServiceMutation();

	const itemForm = useForm<SupplierItemInput>({
		resolver: zodResolver(
			supplierItemInputSchema,
		) as unknown as Resolver<SupplierItemInput>,
		defaultValues: toItemInput(),
	});
	const serviceForm = useForm<SupplierServiceInput>({
		resolver: zodResolver(
			supplierServiceInputSchema,
		) as unknown as Resolver<SupplierServiceInput>,
		defaultValues: toServiceInput(),
	});

	useEffect(() => {
		if (!state.open) return;
		setActiveTab(state.tab);
		itemForm.reset(toItemInput(state.item));
		serviceForm.reset(toServiceInput(state.service));
	}, [state, itemForm, serviceForm]);

	const itemOptions = useMemo(() => {
		const fetched =
			itemLookupQuery.data?.pages.flatMap((page) =>
				page.data.map<SearchableSelectOption>((item) => ({
					value: String(item.id),
					label: item.name,
					secondaryLabel: `${item.uom}${item.sku ? ` - ${item.sku}` : ""}`,
				})),
			) ?? [];

		const selected = state.item
			? {
					value: String(state.item.itemId),
					label: state.item.itemName,
					secondaryLabel: `${state.item.uom}${state.item.supplierSku ? ` - ${state.item.supplierSku}` : ""}`,
				}
			: null;

		const dedup = new Map<string, SearchableSelectOption>();
		if (selected) dedup.set(selected.value, selected);
		for (const option of fetched) dedup.set(option.value, option);
		return Array.from(dedup.values());
	}, [itemLookupQuery.data, state.item]);

	const serviceOptions = useMemo(() => {
		const fetched =
			serviceLookupQuery.data?.pages.flatMap((page) =>
				page.data.map<SearchableSelectOption>((service) => ({
					value: String(service.id),
					label: service.name,
					secondaryLabel: service.defaultUom,
				})),
			) ?? [];

		const selected = state.service
			? {
					value: String(state.service.serviceId),
					label: state.service.serviceName,
					secondaryLabel: "",
				}
			: null;

		const dedup = new Map<string, SearchableSelectOption>();
		if (selected) dedup.set(selected.value, selected);
		for (const option of fetched) dedup.set(option.value, option);
		return Array.from(dedup.values());
	}, [serviceLookupQuery.data, state.service]);

	function submitItem(values: SupplierItemInput) {
		if (isEditItem) {
			editItemMutation.mutate(
				{
					supplierId,
					payload: {
						supplierItemsId: values.supplierItemsId,
						itemId: values.itemId,
						supplierSku: values.supplierSku,
						supplierUnitPricePaise: values.supplierUnitPricePaise,
						taxPercentage: values.taxPercentage,
						leadTimeDays: values.leadTimeDays,
						qty: values.qty,
						uom: values.uom,
						isActive: values.isActive,
					},
				},
				{
					onSuccess: (result) => {
						if (!result.success) return;
						onOpenChange(false);
					},
				},
			);
			return;
		}

		if (!values.itemId) return;
		createItemMutation.mutate(
			{
				supplierId,
				payload: {
					itemId: values.itemId,
					supplierSku: values.supplierSku,
					supplierUnitPricePaise: values.supplierUnitPricePaise,
					taxPercentage: values.taxPercentage,
					leadTimeDays: values.leadTimeDays,
					qty: values.qty,
					uom: values.uom,
					isActive: values.isActive,
				},
			},
			{
				onSuccess: (result) => {
					if (!result.success) return;
					onOpenChange(false);
				},
			},
		);
	}

	function submitService(values: SupplierServiceInput) {
		if (isEditService) {
			editServiceMutation.mutate(
				{
					supplierId,
					payload: {
						supplierServiceId: values.supplierServiceId,
						serviceId: values.serviceId,
						serviceUnitPricePaise: values.serviceUnitPricePaise,
						taxPercentage: values.taxPercentage,
						leadTimeDays: values.leadTimeDays,
						isActive: values.isActive,
					},
				},
				{
					onSuccess: (result) => {
						if (!result.success) return;
						onOpenChange(false);
					},
				},
			);
			return;
		}

		if (!values.serviceId) return;
		createServiceMutation.mutate(
			{
				supplierId,
				payload: {
					serviceId: values.serviceId,
					serviceUnitPricePaise: values.serviceUnitPricePaise,
					taxPercentage: values.taxPercentage,
					leadTimeDays: values.leadTimeDays,
					isActive: values.isActive,
				},
			},
			{
				onSuccess: (result) => {
					if (!result.success) return;
					onOpenChange(false);
				},
			},
		);
	}

	const itemSaving = createItemMutation.isPending || editItemMutation.isPending;
	const serviceSaving =
		createServiceMutation.isPending || editServiceMutation.isPending;

	return (
		<Dialog open={state.open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						{isEditItem || isEditService ? "Edit offering" : "Add offering"}
					</DialogTitle>
					<DialogDescription>
						{isEditItem || isEditService
							? "Update supplier offering details including status."
							: "Add new item or service for this supplier."}
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as OfferingsTab)}
				>
					<TabsList>
						<TabsTrigger
							value="items"
							disabled={lockTab && activeTab !== "items"}
						>
							Items supplied
						</TabsTrigger>
						<TabsTrigger
							value="services"
							disabled={lockTab && activeTab !== "services"}
						>
							Services provided
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{activeTab === "items" ? (
					<Form {...itemForm}>
						<form
							className="space-y-4"
							onSubmit={itemForm.handleSubmit(submitItem)}
						>
							<FormField
								control={itemForm.control}
								name="itemId"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormLabel>Item</FormLabel>
										<FormControl>
											<SearchableSelect
												value={field.value ? String(field.value) : undefined}
												options={itemOptions}
												onValueChange={(value) => {
													const selected = itemOptions.find(
														(option) => option.value === value,
													);
													const [uom] = (selected?.secondaryLabel || "").split(
														" - ",
													);
													field.onChange(Number(value));
													itemForm.setValue("uom", uom || "", {
														shouldDirty: true,
														shouldValidate: true,
													});
												}}
												searchValue={itemLookupSearch}
												onSearchChange={setItemLookupSearch}
												placeholder="Select item"
												searchPlaceholder="Search item"
												emptyText="Type to search items"
												isLoading={itemLookupQuery.isLoading}
												hasNextPage={itemLookupQuery.hasNextPage}
												isFetchingNextPage={itemLookupQuery.isFetchingNextPage}
												onReachEnd={() => itemLookupQuery.fetchNextPage()}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid gap-4 md:grid-cols-2">
								<FormField
									control={itemForm.control}
									name="supplierSku"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													{...field}
													id="supplier-item-sku"
													label="Supplier SKU"
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={itemForm.control}
									name="supplierUnitPricePaise"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-item-price"
													label="Unit price (paise)"
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
									control={itemForm.control}
									name="taxPercentage"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-item-tax"
													label="Tax %"
													type="number"
													name={field.name}
													value={field.value ?? ""}
													onBlur={field.onBlur}
													ref={field.ref}
													onChange={(event) => {
														const value = event.target.valueAsNumber;
														field.onChange(
															Number.isNaN(value) ? undefined : value,
														);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={itemForm.control}
									name="leadTimeDays"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-item-lead"
													label="Lead time days"
													type="number"
													name={field.name}
													value={field.value ?? ""}
													onBlur={field.onBlur}
													ref={field.ref}
													onChange={(event) => {
														const value = event.target.valueAsNumber;
														field.onChange(
															Number.isNaN(value) ? undefined : value,
														);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={itemForm.control}
									name="qty"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-item-qty"
													label="Qty capacity"
													type="number"
													name={field.name}
													value={field.value ?? ""}
													onBlur={field.onBlur}
													ref={field.ref}
													onChange={(event) => {
														const value = event.target.valueAsNumber;
														field.onChange(
															Number.isNaN(value) ? undefined : value,
														);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={itemForm.control}
									name="uom"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													{...field}
													id="supplier-item-uom"
													label="UOM"
													disabled
													readOnly
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="flex justify-between">
								<FormField
									control={itemForm.control}
									name="isActive"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center gap-2">
											<FormLabel>Active</FormLabel>
											<FormControl>
												<Switch
													checked={field.value ?? false}
													onCheckedChange={field.onChange}
													aria-label="Toggle item offering active status"
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<Button type="submit" disabled={itemSaving}>
									{itemSaving ? "Saving..." : "Save item"}
								</Button>
							</div>
						</form>
					</Form>
				) : (
					<Form {...serviceForm}>
						<form
							className="space-y-4"
							onSubmit={serviceForm.handleSubmit(submitService)}
						>
							<div className="grid gap-3 md:grid-cols-2">
								<FormField
									control={serviceForm.control}
									name="serviceId"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormLabel>Service</FormLabel>
											<FormControl>
												<SearchableSelect
													value={field.value ? String(field.value) : undefined}
													options={serviceOptions}
													onValueChange={(value) =>
														field.onChange(Number(value))
													}
													searchValue={serviceLookupSearch}
													onSearchChange={setServiceLookupSearch}
													placeholder="Select service"
													searchPlaceholder="Search service"
													emptyText="Type to search services"
													isLoading={serviceLookupQuery.isLoading}
													hasNextPage={serviceLookupQuery.hasNextPage}
													isFetchingNextPage={
														serviceLookupQuery.isFetchingNextPage
													}
													onReachEnd={() => serviceLookupQuery.fetchNextPage()}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={serviceForm.control}
									name="serviceUnitPricePaise"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-service-price"
													label="Service rate (paise)"
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
									control={serviceForm.control}
									name="taxPercentage"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-service-tax"
													label="Tax %"
													type="number"
													name={field.name}
													value={field.value ?? ""}
													onBlur={field.onBlur}
													ref={field.ref}
													onChange={(event) => {
														const value = event.target.valueAsNumber;
														field.onChange(
															Number.isNaN(value) ? undefined : value,
														);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={serviceForm.control}
									name="leadTimeDays"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="supplier-service-lead"
													label="Lead time days"
													type="number"
													name={field.name}
													value={field.value ?? ""}
													onBlur={field.onBlur}
													ref={field.ref}
													onChange={(event) => {
														const value = event.target.valueAsNumber;
														field.onChange(
															Number.isNaN(value) ? undefined : value,
														);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="flex place-self-start">
									<FormField
										control={serviceForm.control}
										name="isActive"
										render={({ field }) => (
											<FormItem className="flex flex-row items-center gap-2">
												<FormLabel>Active</FormLabel>
												<FormControl>
													<Switch
														checked={field.value ?? false}
														onCheckedChange={field.onChange}
														aria-label="Toggle service offering active status"
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<Button type="submit" disabled={serviceSaving}>
									{serviceSaving ? "Saving..." : "Save service"}
								</Button>
							</div>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
}
