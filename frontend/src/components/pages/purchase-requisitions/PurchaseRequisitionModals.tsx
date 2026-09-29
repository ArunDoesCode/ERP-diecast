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
import { ApprovalHistoryPanel } from "@/components/pages/approval/ApprovalHistoryPanel";
import {
	CancelPurchaseRequisitionDialog,
	getCancelBlockedReason,
} from "@/components/pages/purchase-requisitions/CancelPurchaseRequisitionDialog";
import {
	createDefaults,
	type FormStep,
	ItemDateCell,
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
import {
	useActOnApprovalRequestMutation,
	useCurrentApprovalByDocQuery,
	useSubmitApprovalRequestMutation,
} from "@/lib/api/approval/queries";
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
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
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
	canLinkMachine,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	canLinkMachine: boolean;
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
				assetId: canLinkMachine ? values.assetId : undefined,
				items: values.items.map((item) => ({
					itemId: item.itemId,
					requestedQty: item.requestedQty,
					uom: item.uom,
					expectedDate: item.expectedDate,
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

										{canLinkMachine ? (
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
																		step="0.001"
																		min="0"
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
												<ItemDateCell
													control={
														form.control as unknown as Control<ItemsFormShape>
													}
													index={index}
													id={`create-item-date-${index}`}
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
	canLinkMachine,
}: {
	prId: number | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	canLinkMachine: boolean;
}) {
	const queryClient = useQueryClient();
	const [activeStep, setActiveStep] = useState<FormStep>("details");
	const [submitAction, setSubmitAction] = useState<"save" | "submit">("save");
	const [itemLookupSearch, setItemLookupSearch] = useState("");
	const [cancelOpen, setCancelOpen] = useState(false);

	const detailQuery = usePurchaseRequisitionDetailQuery(
		prId ?? 0,
		open && prId != null,
	);
	const updateMutation = useUpdatePurchaseRequisitionMutation();
	const submitApprovalMutation = useSubmitApprovalRequestMutation();
	const itemLookupQuery = useAssetItemsLookupQuery(itemLookupSearch, 20);

	const detail = detailQuery.data?.success ? detailQuery.data.data : null;
	const pr = detail?.pr;
	const currentUserId = useAuthSessionStore((state) => state.userId);
	const isSuperAdmin = useAuthSessionStore((state) => state.isSuperAdmin);
	const isRequester =
		pr != null &&
		currentUserId != null &&
		String(pr.requestedBy) === currentUserId;
	// BR-PR-17: edit/cancel by the requester or super-admin; submit/withdraw stay the requester's.
	const canOwn = isRequester || isSuperAdmin;
	const canEdit = pr?.status === "draft" && canOwn;
	const canWithdraw = pr?.status === "pending_approval" && isRequester;
	const currentApprovalQuery = useCurrentApprovalByDocQuery(
		canWithdraw ? "pr" : undefined,
		canWithdraw ? pr?.id : undefined,
	);
	const openRequestId = currentApprovalQuery.data?.success
		? (currentApprovalQuery.data.data?.id ?? null)
		: null;
	const actMutation = useActOnApprovalRequestMutation();
	const isMutating =
		updateMutation.isPending ||
		submitApprovalMutation.isPending ||
		actMutation.isPending;
	const statusBadgeStyle = getPRStatusBadgeStyle(pr?.status);
	const cancelBlockedReason = pr
		? getCancelBlockedReason(pr.status, detail?.items ?? [])
		: null;
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

	function onWithdraw() {
		if (openRequestId == null) return;
		actMutation.mutate(
			{ id: openRequestId, input: { action: "withdraw" } },
			{
				onSuccess: (result) => {
					if (result.success) onOpenChange(false);
				},
			},
		);
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
				originalAssetId: pr?.assetId ?? null,
				notes: values.notes,
				originalItems:
					detail?.items.map((item) => ({
						id: item.id,
						itemId: item.itemId,
						requestedQty: item.requestedQty,
						expectedDate: item.expectedDate ?? undefined,
					})) ?? [],
				items: values.items.map((item) => ({
					id: item.id,
					itemId: item.itemId,
					requestedQty: item.requestedQty,
					expectedDate: item.expectedDate,
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
									: pr && !canOwn
										? "Only the requester can edit this PR. Fields are read-only."
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
										<div className="text-sm text-muted-foreground">
											<p>PR: {pr.prNumber}</p>
											<p>
												Estimate: ₹
												{(pr.estimatedAmountPaise / 100).toLocaleString(
													"en-IN",
													{ minimumFractionDigits: 2 },
												)}
											</p>
										</div>
										<Badge
											variant={statusBadgeStyle.variant}
											className={statusBadgeStyle.className}
										>
											{humanizeStatusLabel(pr.status)}
										</Badge>
									</div>

									{pr.status === "cancelled" ? (
										<div className="rounded-md border p-3 text-sm">
											<p>
												Cancelled by {pr.cancelledByName ?? "unknown"}
												{pr.cancelledAt
													? ` on ${new Date(pr.cancelledAt).toLocaleString()}`
													: ""}
											</p>
											<p className="text-muted-foreground">
												Reason: {pr.cancelReason ?? "-"}
											</p>
										</div>
									) : null}

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

												{canLinkMachine ? (
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
																				step="0.001"
																				min="0"
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
														<ItemDateCell
															control={
																form.control as unknown as Control<ItemsFormShape>
															}
															index={index}
															id={`edit-item-date-${index}`}
															disabled={!canEdit}
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
							{pr ? (
								<div className="px-6 pb-4">
									<ApprovalHistoryPanel docType="pr" docId={pr.id} />
								</div>
							) : null}
						</div>

						<DialogFooter className="border-t px-6 py-4 sm:justify-between">
							<div>
								{detail && pr && pr.status !== "cancelled" && canOwn ? (
									<div className="flex flex-col items-start gap-1">
										<Button
											type="button"
											variant="destructive"
											disabled={isMutating || cancelBlockedReason != null}
											onClick={() => setCancelOpen(true)}
										>
											Cancel PR
										</Button>
										{cancelBlockedReason ? (
											<p className="text-xs text-muted-foreground">
												{cancelBlockedReason}
											</p>
										) : null}
									</div>
								) : null}
							</div>

							<div className="flex items-center gap-2">
								{canWithdraw ? (
									<Button
										type="button"
										variant="outline"
										disabled={isMutating || openRequestId == null}
										onClick={onWithdraw}
									>
										{actMutation.isPending ? "Withdrawing..." : "Withdraw"}
									</Button>
								) : null}

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
										{isRequester ? (
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
										) : null}
									</>
								) : null}
							</div>
						</DialogFooter>
					</div>
					{pr ? (
						<CancelPurchaseRequisitionDialog
							prId={pr.id}
							prNumber={pr.prNumber}
							open={cancelOpen}
							onOpenChange={setCancelOpen}
							onCancelled={() => onOpenChange(false)}
						/>
					) : null}
				</DialogContent>
			</Form>
		</Dialog>
	);
}
