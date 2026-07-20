"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";

import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAssetItemsLookupQuery,
  useAssetServicesLookupQuery,
  useCreateSupplierItemMutation,
  useCreateSupplierServiceMutation,
  useEditSupplierItemMutation,
  useEditSupplierServiceMutation,
  useSupplierItemsQuery,
  useSupplierServicesQuery,
} from "@/lib/api/suppliers/queries";
import {
  type SupplierItem,
  type SupplierItemInput,
  type SupplierService,
  type SupplierServiceInput,
  supplierItemInputSchema,
  supplierServiceInputSchema,
} from "@/types/suppliers";

type OfferingsTab = "items" | "services";

type OfferingsDialogState = {
  open: boolean;
  tab: OfferingsTab;
  item?: SupplierItem;
  service?: SupplierService;
};

const LOOKUP_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

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

function OfferingsPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= Math.max(totalPages, 1)}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Total: {total}</p>
    </div>
  );
}

function OfferingsDialog({
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

              <div className="flex justify-between items-center">
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

export function SupplierOfferingsSection({
  supplierId,
}: {
  supplierId: number;
}) {
  const [offeringsTab, setOfferingsTab] = useState<OfferingsTab>("items");
  const [itemsPage, setItemsPage] = useState(1);
  const [servicesPage, setServicesPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [offeringsSearch, setOfferingsSearch] = useState("");
  const [dialogState, setDialogState] = useState<OfferingsDialogState>({
    open: false,
    tab: "items",
  });

  const itemQuery = useSupplierItemsQuery(supplierId, {
    page: itemsPage,
    pageSize,
    q: offeringsTab === "items" ? offeringsSearch : undefined,
  });
  const serviceQuery = useSupplierServicesQuery(supplierId, {
    page: servicesPage,
    pageSize,
    q: offeringsTab === "services" ? offeringsSearch : undefined,
  });

  const itemRows = itemQuery.data?.data ?? [];
  const itemMeta = itemQuery.data?.meta;
  const serviceRows = serviceQuery.data?.data ?? [];
  const serviceMeta = serviceQuery.data?.meta;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <CardTitle>Supplier offerings</CardTitle>
          <Tabs
            value={offeringsTab}
            onValueChange={(value) => {
              setOfferingsTab(value as OfferingsTab);
              setOfferingsSearch("");
              setItemsPage(1);
              setServicesPage(1);
            }}
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
              onChange={(event) => {
                setOfferingsSearch(event.target.value);
                setItemsPage(1);
                setServicesPage(1);
              }}
              placeholder={
                offeringsTab === "items"
                  ? "Search item offerings"
                  : "Search service offerings"
              }
            />
          </div>
          <Button
            type="button"
            onClick={() =>
              setDialogState({
                open: true,
                tab: offeringsTab,
                item: undefined,
                service: undefined,
              })
            }
          >
            <IconPlus className="size-3.5" />
            {offeringsTab === "items" ? "Add item" : "Add service"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              {offeringsTab === "items" ? (
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Supplier SKU</TableHead>
                  <TableHead>Unit price</TableHead>
                  <TableHead>Tax %</TableHead>
                  <TableHead>Lead days</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Tax %</TableHead>
                  <TableHead>Lead days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {(
                offeringsTab === "items"
                  ? itemQuery.isLoading
                  : serviceQuery.isLoading
              )
                ? Array.from({ length: 5 }).map((_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton count
                    <TableRow key={`supplier-offering-skeleton-${index}`}>
                      <TableCell colSpan={offeringsTab === "items" ? 8 : 5}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : offeringsTab === "items"
                  ? itemRows.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setDialogState({
                            open: true,
                            tab: "items",
                            item,
                          })
                        }
                      >
                        <TableCell>{item.itemName}</TableCell>
                        <TableCell>{item.supplierSku || "N/A"}</TableCell>
                        <TableCell>{item.supplierUnitPricePaise}</TableCell>
                        <TableCell>{item.taxPercentage ?? "N/A"}</TableCell>
                        <TableCell>{item.leadTimeDays ?? "N/A"}</TableCell>
                        <TableCell>{item.qty ?? "N/A"}</TableCell>
                        <TableCell>{item.uom}</TableCell>
                        <TableCell>
                          <Badge
                            variant={item.isActive ? "default" : "outline"}
                          >
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  : serviceRows.map((service) => (
                      <TableRow
                        key={service.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setDialogState({
                            open: true,
                            tab: "services",
                            service,
                          })
                        }
                      >
                        <TableCell>{service.serviceName}</TableCell>
                        <TableCell>{service.serviceUnitPricePaise}</TableCell>
                        <TableCell>{service.taxPercentage ?? "N/A"}</TableCell>
                        <TableCell>{service.leadTimeDays ?? "N/A"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={service.isActive ? "default" : "outline"}
                          >
                            {service.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}

              {offeringsTab === "items" &&
              !itemQuery.isLoading &&
              itemRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    No item offerings found.
                  </TableCell>
                </TableRow>
              ) : null}

              {offeringsTab === "services" &&
              !serviceQuery.isLoading &&
              serviceRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No service offerings found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {offeringsTab === "items" ? (
          <OfferingsPagination
            page={itemMeta?.page ?? itemsPage}
            pageSize={itemMeta?.pageSize ?? pageSize}
            total={itemMeta?.total ?? 0}
            totalPages={itemMeta?.totalPages ?? 1}
            onPageChange={setItemsPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setItemsPage(1);
              setServicesPage(1);
            }}
          />
        ) : (
          <OfferingsPagination
            page={serviceMeta?.page ?? servicesPage}
            pageSize={serviceMeta?.pageSize ?? pageSize}
            total={serviceMeta?.total ?? 0}
            totalPages={serviceMeta?.totalPages ?? 1}
            onPageChange={setServicesPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setItemsPage(1);
              setServicesPage(1);
            }}
          />
        )}
      </CardContent>

      <OfferingsDialog
        supplierId={supplierId}
        state={dialogState}
        onOpenChange={(open) =>
          setDialogState((prev) => ({
            ...prev,
            open,
            item: open ? prev.item : undefined,
            service: open ? prev.service : undefined,
          }))
        }
      />
    </Card>
  );
}
