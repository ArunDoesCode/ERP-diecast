"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { FormEvent, ReactNode } from "react";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import {
	SearchableSelect,
	type SearchableSelectOption,
} from "@/components/common/SearchableSelect";
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout";
import { Button } from "@/components/ui/button";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import {
	type PRCreateFormInput,
	prTypeValues,
	todayIso,
} from "@/types/purchase-requisitions";

export type LookupItemOption = {
	value: string;
	label: string;
	secondaryLabel?: string;
};

export function blankLine(): PRCreateFormInput["items"][number] {
	return {
		itemId: undefined as unknown as number,
		requestedQty: 1,
		uom: "",
		expectedDate: "",
	};
}

export function createDefaults(): PRCreateFormInput {
	return {
		type: "stock_reorder",
		assetId: undefined,
		notes: "",
		items: [blankLine()],
	};
}

export function toLookupItemOptions(
	items: Array<{
		id: number;
		name: string;
		uom?: string | null;
		sku?: string | null;
	}>,
): LookupItemOption[] {
	return items.map((item) => ({
		value: String(item.id),
		label: item.name,
		secondaryLabel: `${item.uom ?? ""}${item.sku ? ` - ${item.sku}` : ""}`,
	}));
}

export function mergeLookupItemOptions(
	...lists: LookupItemOption[][]
): LookupItemOption[] {
	const dedup = new Map<string, LookupItemOption>();
	for (const list of lists) {
		for (const option of list) dedup.set(option.value, option);
	}
	return Array.from(dedup.values());
}

/** Saved estimate per line (edit only), keyed by line id. */
export type LineEstimate = { ratePaise: number; amountPaise: number };

export type PurchaseRequisitionFormProps = {
	form: UseFormReturn<PRCreateFormInput>;
	fieldArray: UseFieldArrayReturn<PRCreateFormInput, "items">;
	formId: string;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	/** Fields locked (not a draft, or not the requester). */
	readOnly: boolean;
	/** Type cannot change once saved. */
	typeLocked: boolean;
	canLinkMachine: boolean;
	machineOptions: SearchableSelectOption[];
	machineSearch: string;
	onMachineSearchChange: (value: string) => void;
	machinesLoading: boolean;
	itemOptions: SearchableSelectOption[];
	itemSearch: string;
	onItemSearchChange: (value: string) => void;
	itemsLoading: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onReachEnd: () => void;
	lineEstimates: Record<number, LineEstimate>;
	estimatePaise: number | null;
	noCostHistoryNames: string[];
	serverError: string | null;
	/** Extra content at the bottom of the Summary panel. */
	summaryExtra?: ReactNode;
};

/** Requisition form body: details + lines left, Summary panel right (screens.md screen 5). */
export function PurchaseRequisitionForm({
	form,
	fieldArray,
	formId,
	onSubmit,
	readOnly,
	typeLocked,
	canLinkMachine,
	machineOptions,
	machineSearch,
	onMachineSearchChange,
	machinesLoading,
	itemOptions,
	itemSearch,
	onItemSearchChange,
	itemsLoading,
	hasNextPage,
	isFetchingNextPage,
	onReachEnd,
	lineEstimates,
	estimatePaise,
	noCostHistoryNames,
	serverError,
	summaryExtra,
}: PurchaseRequisitionFormProps) {
	const itemsError =
		form.formState.errors.items?.root?.message ??
		(typeof form.formState.errors.items?.message === "string"
			? form.formState.errors.items.message
			: null);

	return (
		<TwoPaneLayout
			sideLabel="Summary"
			side={
				<div className="space-y-3 rounded-lg border bg-card p-4">
					<h2 className="font-heading text-base font-semibold">Summary</h2>
					<dl className="space-y-2 text-sm">
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">Lines</dt>
							<dd className="tabular-nums">{fieldArray.fields.length}</dd>
						</div>
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">Estimate</dt>
							<dd className="tabular-nums">
								{estimatePaise == null ? "–" : formatMoney(estimatePaise)}
							</dd>
						</div>
					</dl>
					<p className="text-sm text-muted-foreground">
						{estimatePaise == null
							? "The estimate is worked out when you save."
							: "Estimate from the last save."}
					</p>
					{noCostHistoryNames.length > 0 ? (
						<p className="text-sm text-muted-foreground">
							Standard rate used for {noCostHistoryNames.join(", ")} (no cost
							history yet).
						</p>
					) : null}
					{summaryExtra}
				</div>
			}
		>
			<form
				id={formId}
				onSubmit={onSubmit}
				noValidate
				className="space-y-6"
				aria-label="Purchase requisition"
			>
				{serverError ? (
					<div
						role="alert"
						className="rounded-md border border-destructive bg-destructive-subtle p-3 text-sm text-destructive"
					>
						{serverError}
					</div>
				) : null}

				<section className="space-y-4 rounded-lg border bg-card p-4">
					<h2 className="font-heading text-base font-semibold">Details</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<FormField
							control={form.control}
							name="type"
							render={({ field }) => (
								<FormItem className="min-h-19 content-start gap-1.5">
									<FormLabel>PR type</FormLabel>
									<FormControl>
										<select
											className="h-9 w-full rounded-md border border-input bg-input/20 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
											value={field.value}
											disabled={readOnly || typeLocked}
											onChange={(event) => field.onChange(event.target.value)}
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

						{canLinkMachine && !typeLocked ? (
							<FormField
								control={form.control}
								name="assetId"
								render={({ field }) => (
									<FormItem className="min-h-19 content-start gap-1.5">
										<FormLabel>Machine</FormLabel>
										<FormControl>
											<SearchableSelect
												value={field.value ? String(field.value) : undefined}
												options={machineOptions}
												onValueChange={(value) => field.onChange(Number(value))}
												searchValue={machineSearch}
												onSearchChange={onMachineSearchChange}
												placeholder="Select machine"
												searchPlaceholder="Search machine"
												emptyText="No machines found"
												isLoading={machinesLoading}
												disabled={readOnly}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						) : null}

						<FormField
							control={form.control}
							name="notes"
							render={({ field }) => (
								<FormItem className="min-h-19 content-start gap-1.5 md:col-span-2">
									<FormLabel>Notes</FormLabel>
									<FormControl>
										<Textarea
											{...field}
											placeholder="Add notes"
											disabled={readOnly}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</section>

				<section className="space-y-4 rounded-lg border bg-card p-4">
					<div className="flex items-center justify-between gap-2">
						<h2 className="font-heading text-base font-semibold">Lines</h2>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={readOnly}
							onClick={() => fieldArray.append(blankLine())}
						>
							<IconPlus />
							Add line
						</Button>
					</div>

					{itemsError ? (
						<p role="alert" className="text-sm text-destructive">
							{itemsError}
						</p>
					) : null}

					<ul className="space-y-4">
						{fieldArray.fields.map((row, index) => {
							const lineId = form.getValues(`items.${index}.id`);
							const estimate =
								typeof lineId === "number" ? lineEstimates[lineId] : undefined;
							return (
								<li
									key={row.id}
									className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-6"
								>
									<FormField
										control={form.control}
										name={`items.${index}.itemId`}
										render={({ field }) => (
											<FormItem className="min-h-19 content-start gap-1.5 md:col-span-3">
												<FormLabel>Item</FormLabel>
												<FormControl>
													<SearchableSelect
														value={
															field.value ? String(field.value) : undefined
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
															form.setValue(`items.${index}.uom`, uom || "", {
																shouldDirty: true,
																shouldValidate: true,
															});
														}}
														searchValue={itemSearch}
														onSearchChange={onItemSearchChange}
														placeholder="Select item"
														searchPlaceholder="Search item"
														emptyText="Type to search items"
														isLoading={itemsLoading}
														hasNextPage={hasNextPage}
														isFetchingNextPage={isFetchingNextPage}
														onReachEnd={onReachEnd}
														disabled={readOnly}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name={`items.${index}.requestedQty`}
										render={({ field }) => {
											const uom = form.watch(`items.${index}.uom`);
											return (
												<FormItem className="min-h-19 content-start gap-1.5">
													<FormLabel>Quantity</FormLabel>
													<div className="relative">
														<FormControl>
															<Input
																type="number"
																step="0.001"
																min="0"
																className="pr-12 text-right tabular-nums"
																name={field.name}
																value={
																	typeof field.value === "number" &&
																	Number.isFinite(field.value)
																		? field.value
																		: ""
																}
																onBlur={field.onBlur}
																ref={field.ref}
																disabled={readOnly}
																onChange={(event) => {
																	const raw = event.target.value;
																	field.onChange(
																		raw === "" ? Number.NaN : Number(raw),
																	);
																}}
															/>
														</FormControl>
														{uom ? (
															<span
																aria-hidden="true"
																className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
															>
																{uom}
															</span>
														) : null}
													</div>
													<FormMessage />
												</FormItem>
											);
										}}
									/>

									<FormField
										control={form.control}
										name={`items.${index}.expectedDate`}
										render={({ field }) => (
											<FormItem className="min-h-19 content-start gap-1.5 md:col-span-2">
												<FormLabel>Required by</FormLabel>
												<FormControl>
													<Input
														type="date"
														min={todayIso()}
														disabled={readOnly}
														{...field}
														value={field.value ?? ""}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<div className="flex items-end justify-between gap-3 md:col-span-6">
										<p className="text-sm text-muted-foreground">
											{estimate ? (
												<>
													Estimate rate{" "}
													<span className="tabular-nums">
														{formatMoney(estimate.ratePaise)}
													</span>
													{" · "}Estimate{" "}
													<span className="tabular-nums">
														{formatMoney(estimate.amountPaise)}
													</span>
												</>
											) : (
												"Estimate is worked out when you save."
											)}
										</p>
										<Button
											type="button"
											size="icon"
											variant="outline"
											aria-label={`Remove line ${index + 1}`}
											disabled={readOnly || fieldArray.fields.length <= 1}
											onClick={() => fieldArray.remove(index)}
										>
											<IconTrash />
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			</form>
		</TwoPaneLayout>
	);
}
