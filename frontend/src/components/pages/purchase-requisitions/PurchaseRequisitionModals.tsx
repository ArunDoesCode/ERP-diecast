"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import {
	type BaseSyntheticEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type Control,
	type Resolver,
	useFieldArray,
	useForm,
} from "react-hook-form";
import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import {
	createDefaults,
	type FormStep,
	ItemRowsTable,
	type ItemsFormShape,
	ItemUomCell,
	type LookupItemOption,
	mergeLookupItemOptions,
	toEditDefaults,
	toLookupItemOptions,
} from "@/components/pages/purchase-requisitions/purchase-requisition-modal-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitApprovalRequestMutation } from "@/lib/api/approval/queries";
import { useMachinesQuery } from "@/lib/api/asset/queries";
import {
	purchaseRequisitionKeys,
	toPRCreatePayload,
	toPRUpdatePayload,
	useCreatePurchaseRequisitionMutation,
	usePurchaseRequisitionDetailQuery,
	useUpdatePurchaseRequisitionMutation,
} from "@/lib/api/purchase-requisitions/queries";
import { useAssetItemsLookupQuery } from "@/lib/api/suppliers/queries";
import {
	getPRStatusBadgeStyle,
	humanizeStatusLabel,
} from "@/lib/pr-status-badge";
import {
	type PRCreateFormInput,
	type PREditFormInput,
	prCreateFormSchema,
	prEditFormSchema,
	prTypeValues,
} from "@/types/purchase-requisitions";

export function CreatePurchaseRequisitionModal({
	open,
	onOpenChange,
	isFloorSupervisor,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isFloorSupervisor: boolean;
}) {
	const createMutation = useCreatePurchaseRequisitionMutation();
	const [activeStep, setActiveStep] = useState<FormStep>("details");
	const [machineSearch, setMachineSearch] = useState("");
	const [itemLookupSearch, setItemLookupSearch] = useState("");

	const form = useForm<PRCreateFormInput>({
		resolver: zodResolver(
			prCreateFormSchema,
		) as unknown as Resolver<PRCreateFormInput>,
		defaultValues: createDefaults(),
	});

	const itemsFieldArray = useFieldArray({
		control: form.control,
		name: "items",
	});

	const machineQuery = useMachinesQuery({
		page: 1,
		pageSize: 20,
		q: machineSearch || undefined,
	});
	const itemLookupQuery = useAssetItemsLookupQuery(itemLookupSearch, 20);

	const machineOptions = useMemo(
		() =>
			(machineQuery.data?.data ?? []).map<SearchableSelectOption>(
				(machine) => ({
					value: String(machine.id),
					label: machine.name,
					secondaryLabel: machine.type ?? "No type",
				}),
			),
		[machineQuery.data?.data],
	);
	const itemOptions = useMemo(() => {
		const raw =
			itemLookupQuery.data?.pages.flatMap((page) =>
				toLookupItemOptions(page.data),
			) ?? [];

		return mergeLookupItemOptions(raw) as SearchableSelectOption[];
	}, [itemLookupQuery.data]);

	useEffect(() => {
		if (!open) return;
		form.reset(createDefaults());
		setActiveStep("details");
	}, [open, form]);

	function goNext() {
		if (activeStep === "details") {
			setActiveStep("items");
		}
	}

	function onSubmit(values: PRCreateFormInput) {
		createMutation.mutate(
			toPRCreatePayload({
				type: values.type,
				notes: values.notes,
				assetId: isFloorSupervisor ? values.assetId : undefined,
				items: values.items.map((item) => ({
					itemId: item.itemId,
					requestedQty: item.requestedQty,
					uom: item.uom,
				})),
			}),
			{
				onSuccess: (result) => {
					if (!result.success) return;
					onOpenChange(false);
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<Form {...form}>
				<DialogContent className="min-w-3/4 gap-0 p-0">
					<div className="flex flex-col">
						<DialogHeader className="border-b px-6 py-5">
							<DialogTitle>Create purchase requisition</DialogTitle>
							<DialogDescription className="">
								New PR starts in draft. Submit for approval from edit flow.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 overflow-y-auto px-6 py-6">
							<Tabs
								value={activeStep}
								onValueChange={(value) => setActiveStep(value as FormStep)}
							>
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="details">Details</TabsTrigger>
									<TabsTrigger value="items">Items</TabsTrigger>
								</TabsList>
							</Tabs>

							<form
								id="create-pr-form"
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-4"
							>
								{activeStep === "details" ? (
									<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
										<FormField
											control={form.control}
											name="type"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormLabel
														className="sr-only"
														htmlFor="create-pr-type"
													>
														PR type
													</FormLabel>
													<FormControl>
														<select
															id="create-pr-type"
															aria-label="PR type"
															className="h-12 w-full rounded-lg border border-input bg-input/20 px-3 text-sm"
															value={field.value}
															onChange={(event) =>
																field.onChange(event.target.value)
															}
														>
															{prTypeValues.map((value) => (
																<option key={value} value={value}>
																	{value}
																</option>
															))}
														</select>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										{isFloorSupervisor ? (
											<FormField
												control={form.control}
												name="assetId"
												render={({ field }) => (
													<FormItem className="min-h-19">
														<FormLabel>Machine</FormLabel>
														<FormControl>
															<SearchableSelect
																value={
																	field.value ? String(field.value) : undefined
																}
																options={machineOptions}
																onValueChange={(value) =>
																	field.onChange(Number(value))
																}
																searchValue={machineSearch}
																onSearchChange={setMachineSearch}
																placeholder="Select machine"
																searchPlaceholder="Search machine"
																emptyText="No machines found"
																isLoading={machineQuery.isLoading}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										) : null}

										<div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground md:col-span-2">
											Sale order: coming soon.
										</div>

										<FormField
											control={form.control}
											name="notes"
											render={({ field }) => (
												<FormItem className="md:col-span-2">
													<FormLabel>Notes</FormLabel>
													<FormControl>
														<Textarea {...field} placeholder="Add notes" />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								) : null}

								{activeStep === "items" ? (
									<ItemRowsTable
										rows={itemsFieldArray.fields}
										readOnly={false}
										onAdd={() =>
											itemsFieldArray.append({
												itemId: undefined as unknown as number,
												requestedQty: 1,
												uom: "",
											})
										}
										renderFields={(index) => (
											<>
												<TableCell>
													<FormField
														control={form.control}
														name={`items.${index}.itemId`}
														render={({ field }) => (
															<FormItem className="">
																<FormLabel className="sr-only">Item</FormLabel>
																<FormControl>
																	<SearchableSelect
																		value={
																			field.value
																				? String(field.value)
																				: undefined
																		}
																		options={itemOptions}
																		onValueChange={(value) => {
																			const selected = itemOptions.find(
																				(option) => option.value === value,
																			);
																			const [uom] = (
																				selected?.secondaryLabel || ""
																			).split(" - ");
																			field.onChange(Number(value));
																			form.setValue(
																				`items.${index}.uom`,
																				uom || "",
																				{
																					shouldDirty: true,
																					shouldValidate: true,
																				},
																			);
																		}}
																		searchValue={itemLookupSearch}
																		onSearchChange={setItemLookupSearch}
																		placeholder="Select item"
																		searchPlaceholder="Search item"
																		emptyText="Type to search items"
																		isLoading={itemLookupQuery.isLoading}
																		hasNextPage={itemLookupQuery.hasNextPage}
																		isFetchingNextPage={
																			itemLookupQuery.isFetchingNextPage
																		}
																		onReachEnd={() =>
																			itemLookupQuery.fetchNextPage()
																		}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
												</TableCell>

												<TableCell>
													<FormField
														control={form.control}
														name={`items.${index}.requestedQty`}
														render={({ field }) => (
															<FormItem>
																<FormControl>
																	<FloatingLabelInput
																		id={`create-item-qty-${index}`}
																		label="Qty"
																		type="number"
																		name={field.name}
																		value={
																			typeof field.value === "number" &&
																			Number.isFinite(field.value)
																				? field.value
																				: ""
																		}
																		onBlur={field.onBlur}
																		ref={field.ref}
																		onChange={(event) => {
																			const raw = event.target.value;
																			field.onChange(
																				raw === "" ? Number.NaN : Number(raw),
																			);
																		}}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
												</TableCell>
												<ItemUomCell
													control={
														form.control as unknown as Control<ItemsFormShape>
													}
													index={index}
												/>

												<TableCell className="text-right">
													<Button
														type="button"
														size="icon"
														variant="destructive"
														disabled={itemsFieldArray.fields.length <= 1}
														onClick={() => itemsFieldArray.remove(index)}
													>
														<IconTrash className="size-3.5" />
													</Button>
												</TableCell>
											</>
										)}
									/>
								) : null}
							</form>
						</div>

						<DialogFooter className="border-t px-6 py-4">
							{activeStep !== "items" ? (
								<Button type="button" onClick={goNext}>
									Next
								</Button>
							) : (
								<Button
									type="submit"
									form="create-pr-form"
									disabled={createMutation.isPending}
								>
									{createMutation.isPending ? "Creating..." : "Create PR"}
								</Button>
							)}
						</DialogFooter>
					</div>
				</DialogContent>
			</Form>
		</Dialog>
	);
}

export function EditPurchaseRequisitionModal({
	prId,
	open,
	onOpenChange,
	isFloorSupervisor,
}: {
	prId: number | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isFloorSupervisor: boolean;
}) {
	const queryClient = useQueryClient();
	const [activeStep, setActiveStep] = useState<FormStep>("details");
	const [submitAction, setSubmitAction] = useState<"save" | "submit">("save");
	const [itemLookupSearch, setItemLookupSearch] = useState("");

	const detailQuery = usePurchaseRequisitionDetailQuery(
		prId ?? 0,
		open && prId != null,
	);
	const updateMutation = useUpdatePurchaseRequisitionMutation();
	const submitApprovalMutation = useSubmitApprovalRequestMutation();
	const itemLookupQuery = useAssetItemsLookupQuery(itemLookupSearch, 20);

	const detail = detailQuery.data?.success ? detailQuery.data.data : null;
	const pr = detail?.pr;
	const canEdit = pr?.status === "draft";
	const isMutating =
		updateMutation.isPending || submitApprovalMutation.isPending;
	const statusBadgeStyle = getPRStatusBadgeStyle(pr?.status);
	const itemOptions = useMemo(() => {
		const fetched =
			itemLookupQuery.data?.pages.flatMap((page) =>
				toLookupItemOptions(page.data),
			) ?? [];

		const selected =
			detail?.items.map<LookupItemOption>((item) => ({
				value: String(item.itemId),
				label: item.itemName ?? `Item ${item.itemId}`,
				secondaryLabel:
					item.uom && item.itemSku
						? `${item.uom} - ${item.itemSku}`
						: (item.uom ?? item.itemSku ?? ""),
			})) ?? [];

		return mergeLookupItemOptions(
			selected,
			fetched,
		) as SearchableSelectOption[];
	}, [itemLookupQuery.data, detail?.items]);

	const form = useForm<PREditFormInput>({
		resolver: zodResolver(
			prEditFormSchema,
		) as unknown as Resolver<PREditFormInput>,
		defaultValues: {
			prId: prId ?? 0,
			status: "draft",
			notes: "",
			items: [
				{
					itemId: undefined as unknown as number,
					requestedQty: 1,
					uom: "",
					expectedDate: "",
				},
			],
		},
	});

	const itemsFieldArray = useFieldArray({
		control: form.control,
		name: "items",
	});

	// Seed the form from the fetched PR exactly once per time the modal opens for
	// a given prId — not on every `detail`/`pr` reference change, or a background
	// refetch (e.g. another tab drafting a PO against this same PR, which
	// invalidates this PR's detail cache) would silently reset the form the user
	// is mid-editing and snap them back to the "details" step.
	const seededForRef = useRef<number | null>(null);
	useEffect(() => {
		if (!open) {
			seededForRef.current = null;
			return;
		}
		if (!detail || !pr || seededForRef.current === pr.id) return;
		seededForRef.current = pr.id;

		form.reset(
			toEditDefaults({
				prId: pr.id,
				status: pr.status,
				notes: pr.notes,
				items: detail.items,
			}),
		);
		setActiveStep("details");
	}, [open, detail, pr, form]);

	function goNext() {
		if (activeStep === "details") {
			setActiveStep("items");
		}
	}

	function getSubmitAction(event?: BaseSyntheticEvent): "save" | "submit" {
		const submitter =
			event?.nativeEvent instanceof SubmitEvent
				? event.nativeEvent.submitter
				: null;

		return submitter instanceof HTMLButtonElement &&
			submitter.value === "submit"
			? "submit"
			: "save";
	}

	function onSubmit(values: PREditFormInput, event?: BaseSyntheticEvent) {
		if (!canEdit) return;
		const action = getSubmitAction(event);
		setSubmitAction(action);

		updateMutation.mutate(
			toPRUpdatePayload({
				prId: values.prId,
				type: pr?.type ?? "stock_reorder",
				saleOrderId: pr?.saleOrderId ?? null,
				assetId: pr?.assetId ?? null,
				status: values.status,
				notes: values.notes,
				originalItems:
					detail?.items.map((item) => ({
						id: item.id,
						itemId: item.itemId,
						requestedQty: item.requestedQty,
					})) ?? [],
				items: values.items.map((item) => ({
					id: item.id,
					itemId: item.itemId,
					requestedQty: item.requestedQty,
				})),
			}),
			{
				onSuccess: async (result) => {
					if (!result.success) return;
					if (action === "submit") {
						submitApprovalMutation.mutate(
							{ docType: "pr", docId: values.prId },
							{
								onSuccess: async (submitResult) => {
									if (!submitResult.success) return;
									await Promise.all([
										queryClient.invalidateQueries({
											queryKey: purchaseRequisitionKeys.cards(),
										}),
										queryClient.invalidateQueries({
											queryKey: purchaseRequisitionKeys.detail(values.prId),
										}),
									]);
									onOpenChange(false);
								},
							},
						);
						return;
					}
					onOpenChange(false);
				},
			},
		);
	}

	function onCancelPR() {
		if (!pr || !detail || pr.status === "cancelled") return;

		updateMutation.mutate(
			toPRUpdatePayload({
				prId: pr.id,
				type: pr.type,
				saleOrderId: pr.saleOrderId,
				assetId: pr.assetId,
				status: "cancelled",
				notes: pr.notes ?? undefined,
				originalItems: detail.items.map((item) => ({
					id: item.id,
					itemId: item.itemId,
					requestedQty: item.requestedQty,
				})),
				items: detail.items.map((item) => ({
					id: item.id,
					itemId: item.itemId,
					requestedQty: item.requestedQty,
				})),
			}),
			{
				onSuccess: (result) => {
					if (!result.success) return;
					onOpenChange(false);
				},
			},
		);
	}

	if (!open) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<Form {...form}>
				<DialogContent className="min-w-3/4 gap-0 p-0">
					<div className="flex max-h-[85vh] flex-col">
						<DialogHeader className="border-b px-6 py-5">
							<DialogTitle>Edit purchase requisition</DialogTitle>
							<DialogDescription>
								{canEdit
									? "Draft PR can be edited or submitted for approval."
									: "PR is not in draft. Fields are read-only."}
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 overflow-y-auto px-6 py-6">
							{detailQuery.isLoading ? (
								<div className="space-y-3">
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-32 w-full" />
								</div>
							) : null}

							{!detailQuery.isLoading && !detail ? (
								<p className="text-sm text-destructive">
									Failed to load PR details.
								</p>
							) : null}

							{detail && pr ? (
								<>
									<div className="flex items-center justify-between">
										<p className="text-sm text-muted-foreground">
											PR: {pr.prNumber}
										</p>
										<Badge
											variant={statusBadgeStyle.variant}
											className={statusBadgeStyle.className}
										>
											{humanizeStatusLabel(pr.status)}
										</Badge>
									</div>

									<Tabs
										value={activeStep}
										onValueChange={(value) => setActiveStep(value as FormStep)}
									>
										<TabsList className="grid w-full grid-cols-2">
											<TabsTrigger value="details">Details</TabsTrigger>
											<TabsTrigger value="items">Items</TabsTrigger>
										</TabsList>
									</Tabs>

									<form
										id="edit-pr-form"
										onSubmit={form.handleSubmit(onSubmit)}
										className="space-y-4"
									>
										{activeStep === "details" ? (
											<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
												<FormItem className="min-h-19">
													{/* <FormLabel>PR type</FormLabel> */}
													<FormControl>
														<FloatingLabelInput
															value={pr.type}
															label="PR type"
															readOnly
															disabled
														/>
													</FormControl>
												</FormItem>

												{isFloorSupervisor ? (
													<FormItem className="min-h-19">
														<FormLabel>Machine</FormLabel>
														<FormControl>
															<FloatingLabelInput
																value={pr.assetId ? String(pr.assetId) : ""}
																label="Machine id"
																readOnly
																disabled
															/>
														</FormControl>
													</FormItem>
												) : null}

												<div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground md:col-span-2">
													Sale order: coming soon.
												</div>

												<FormField
													control={form.control}
													name="notes"
													render={({ field }) => (
														<FormItem className="md:col-span-2">
															<FormLabel>Notes</FormLabel>
															<FormControl>
																<Textarea
																	{...field}
																	placeholder="Add notes"
																	disabled={!canEdit}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
											</div>
										) : null}

										{activeStep === "items" ? (
											<ItemRowsTable
												rows={itemsFieldArray.fields}
												readOnly={!canEdit}
												onAdd={() =>
													itemsFieldArray.append({
														itemId: undefined as unknown as number,
														requestedQty: 1,
														uom: "",
														expectedDate: "",
													})
												}
												renderFields={(index) => (
													<>
														<TableCell>
															<FormField
																control={form.control}
																name={`items.${index}.itemId`}
																render={({ field }) => (
																	<FormItem className="">
																		<FormLabel className="sr-only">
																			Item
																		</FormLabel>
																		<FormControl>
																			<SearchableSelect
																				value={
																					field.value
																						? String(field.value)
																						: undefined
																				}
																				options={itemOptions}
																				onValueChange={(value) => {
																					const selected = itemOptions.find(
																						(option) => option.value === value,
																					);
																					const [uom] = (
																						selected?.secondaryLabel || ""
																					).split(" - ");
																					field.onChange(Number(value));
																					form.setValue(
																						`items.${index}.uom`,
																						uom || "",
																						{
																							shouldDirty: true,
																							shouldValidate: true,
																						},
																					);
																				}}
																				searchValue={itemLookupSearch}
																				onSearchChange={setItemLookupSearch}
																				placeholder="Select item"
																				searchPlaceholder="Search item"
																				emptyText="Type to search items"
																				isLoading={itemLookupQuery.isLoading}
																				hasNextPage={
																					itemLookupQuery.hasNextPage
																				}
																				isFetchingNextPage={
																					itemLookupQuery.isFetchingNextPage
																				}
																				onReachEnd={() =>
																					itemLookupQuery.fetchNextPage()
																				}
																				disabled={!canEdit}
																			/>
																		</FormControl>
																		<FormMessage />
																	</FormItem>
																)}
															/>
														</TableCell>

														<TableCell>
															<FormField
																control={form.control}
																name={`items.${index}.requestedQty`}
																render={({ field }) => (
																	<FormItem>
																		<FormControl>
																			<FloatingLabelInput
																				id={`edit-item-qty-${index}`}
																				label="Qty"
																				type="number"
																				name={field.name}
																				value={
																					typeof field.value === "number" &&
																					Number.isFinite(field.value)
																						? field.value
																						: ""
																				}
																				onBlur={field.onBlur}
																				ref={field.ref}
																				disabled={!canEdit}
																				onChange={(event) => {
																					const raw = event.target.value;
																					field.onChange(
																						raw === ""
																							? Number.NaN
																							: Number(raw),
																					);
																				}}
																			/>
																		</FormControl>
																		<FormMessage />
																	</FormItem>
																)}
															/>
														</TableCell>

														<ItemUomCell
															control={
																form.control as unknown as Control<ItemsFormShape>
															}
															index={index}
														/>

														<TableCell className="text-right">
															<Button
																type="button"
																size="icon"
																variant="destructive"
																disabled={
																	!canEdit || itemsFieldArray.fields.length <= 1
																}
																onClick={() => itemsFieldArray.remove(index)}
															>
																<IconTrash className="size-3.5" />
															</Button>
														</TableCell>
													</>
												)}
											/>
										) : null}
									</form>
								</>
							) : null}
						</div>

						<DialogFooter className="border-t px-6 py-4 sm:justify-between">
							<div>
								{detail && pr?.status !== "cancelled" ? (
									<Button
										type="button"
										variant="destructive"
										disabled={isMutating}
										onClick={onCancelPR}
									>
										{updateMutation.isPending ? "Cancelling..." : "Cancel PR"}
									</Button>
								) : null}
							</div>

							<div className="flex items-center gap-2">
								{detail && activeStep !== "items" ? (
									<Button type="button" onClick={goNext}>
										Next
									</Button>
								) : null}

								{detail && activeStep === "items" && canEdit ? (
									<>
										<Button
											type="submit"
											form="edit-pr-form"
											variant="outline"
											value="save"
											disabled={isMutating}
										>
											{updateMutation.isPending && submitAction === "save"
												? "Saving..."
												: "Save changes"}
										</Button>
										<Button
											type="submit"
											form="edit-pr-form"
											value="submit"
											disabled={isMutating}
										>
											{submitApprovalMutation.isPending &&
											submitAction === "submit"
												? "Submitting..."
												: "Submit for approval"}
										</Button>
									</>
								) : null}
							</div>
						</DialogFooter>
					</div>
				</DialogContent>
			</Form>
		</Dialog>
	);
}
