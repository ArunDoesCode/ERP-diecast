"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SearchableSelect } from "@/components/common/SearchableSelect";
import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { ScoItemPicker } from "@/components/pages/subcontracting/ScoItemPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingLabelInput } from "@/components/ui/floating-label";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	useCreateScoMutation,
	useUpdateScoMutation,
} from "@/lib/api/subcontracting/queries";
import {
	useSupplierServicesQuery,
	useSuppliersQuery,
} from "@/lib/api/suppliers/queries";
import { istTodayIso } from "@/lib/ist-date";
import type { ScoDetailPayload, ScoLineInput } from "@/types/subcontracting";
import { GST_SLABS, type Supplier } from "@/types/suppliers";

type LineState = {
	key: number;
	rawItemId?: number;
	rawItemLabel?: string;
	finishedItemId?: number;
	finishedItemLabel?: string;
	serviceId?: number;
	serviceLabel?: string;
	sendQty: string;
	returnQty: string;
	priceRupees: string;
	gst: string;
	batch: string;
};

let lineKeySeed = 0;

function emptyLine(): LineState {
	lineKeySeed += 1;
	return {
		key: lineKeySeed,
		sendQty: "",
		returnQty: "",
		priceRupees: "",
		gst: "0",
		batch: "",
	};
}

function linesFromDetail(detail: ScoDetailPayload): LineState[] {
	return detail.items.map((line) => {
		lineKeySeed += 1;
		return {
			key: lineKeySeed,
			rawItemId: line.rawItemId,
			rawItemLabel: `${line.rawItemSku} · ${line.rawItemName}`,
			finishedItemId: line.finishedItemId,
			finishedItemLabel: `${line.finishedItemSku} · ${line.finishedItemName}`,
			serviceId: line.serviceId,
			serviceLabel: line.serviceDescription,
			sendQty: String(line.rawQtyToIssue),
			returnQty: String(line.expectedReturnQty),
			priceRupees: String(line.serviceUnitPricePaise / 100),
			gst: String(line.serviceTaxPercentage),
			batch: line.rawItemBatch ?? "",
		};
	});
}

function isWholePositive(value: string) {
	const n = Number(value);
	return value.trim() !== "" && Number.isInteger(n) && n > 0;
}

function lineError(line: LineState): string | null {
	if (!line.rawItemId) return "Pick the raw item";
	if (!line.finishedItemId) return "Pick the finished item";
	if (line.rawItemId === line.finishedItemId)
		return "Raw and finished item must differ";
	if (!line.serviceId) return "Pick the service";
	if (!isWholePositive(line.sendQty)) return "Send qty must be a whole number";
	if (!isWholePositive(line.returnQty))
		return "Return qty must be a whole number";
	const price = Number(line.priceRupees);
	if (line.priceRupees.trim() === "" || Number.isNaN(price) || price < 0)
		return "Enter a valid price";
	return null;
}

function toLineInput(line: LineState): ScoLineInput {
	return {
		rawItemId: line.rawItemId as number,
		finishedItemId: line.finishedItemId as number,
		serviceId: line.serviceId as number,
		rawQtyToIssue: Number(line.sendQty),
		expectedReturnQty: Number(line.returnQty),
		serviceUnitPricePaise: Math.round(Number(line.priceRupees) * 100),
		serviceTaxPercentage: Number(line.gst),
		...(line.batch.trim() ? { rawItemBatch: line.batch.trim() } : {}),
	};
}

type ScoFormProps = {
	/** Present in edit mode (draft SCO). */
	existing?: ScoDetailPayload;
};

export function ScoForm({ existing }: ScoFormProps) {
	const router = useRouter();
	const createMutation = useCreateScoMutation();
	const updateMutation = useUpdateScoMutation();
	const isPending = createMutation.isPending || updateMutation.isPending;

	const [vendorSearch, setVendorSearch] = useState("");
	const debouncedVendorSearch = useDebouncedValue(vendorSearch, 300);
	const [vendorId, setVendorId] = useState<number | undefined>(
		existing?.sco.vendorId,
	);
	const [expectedReturnDate, setExpectedReturnDate] = useState(
		existing?.sco.expectedReturnDate?.slice(0, 10) ?? "",
	);
	const [projectRef, setProjectRef] = useState(existing?.sco.projectRef ?? "");
	const [notes, setNotes] = useState(existing?.sco.notes ?? "");
	const [lines, setLines] = useState<LineState[]>(() =>
		existing ? linesFromDetail(existing) : [emptyLine()],
	);
	const [showErrors, setShowErrors] = useState(false);

	const suppliersQuery = useSuppliersQuery({
		page: 1,
		pageSize: 50,
		sortBy: "name",
		sortDir: "asc",
		status: "active",
		q: debouncedVendorSearch || undefined,
	});
	const vendorOptions = useMemo(
		() =>
			(suppliersQuery.data?.data ?? [])
				// BR-SCO-01: only active service providers can get an SCO.
				.filter(
					(supplier: Supplier) =>
						supplier.isActive &&
						(supplier.type === "service_provider" || supplier.type === "both"),
				)
				.map((supplier: Supplier) => ({
					value: String(supplier.id),
					label: supplier.name,
				})),
		[suppliersQuery.data?.data],
	);

	const servicesQuery = useSupplierServicesQuery(
		vendorId ?? 0,
		{ page: 1, pageSize: 100 },
		Boolean(vendorId),
	);
	const vendorServices = useMemo(
		() => (servicesQuery.data?.data ?? []).filter((row) => row.isActive),
		[servicesQuery.data?.data],
	);

	function updateLine(key: number, patch: Partial<LineState>) {
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
		);
	}

	function onVendorChange(value: string) {
		const next = Number(value);
		if (next === vendorId) return;
		setVendorId(next);
		// Services belong to the vendor, so earlier picks no longer apply.
		setLines((current) =>
			current.map((line) => ({
				...line,
				serviceId: undefined,
				serviceLabel: undefined,
				priceRupees: "",
				gst: "0",
			})),
		);
	}

	function onServiceChange(key: number, serviceId: number) {
		const service = vendorServices.find((row) => row.serviceId === serviceId);
		updateLine(key, {
			serviceId,
			serviceLabel: service?.serviceName,
			priceRupees: service ? String(service.serviceUnitPricePaise / 100) : "",
			gst: String(service?.taxPercentage ?? 0),
		});
	}

	const totals = lines.reduce(
		(sum, line) => {
			const value = Math.round(
				Number(line.priceRupees || 0) * 100 * Number(line.returnQty || 0),
			);
			const tax = Math.round((value * Number(line.gst || 0)) / 100);
			return { value: sum.value + value, tax: sum.tax + tax };
		},
		{ value: 0, tax: 0 },
	);

	const headerError = !vendorId
		? "Pick a vendor"
		: !expectedReturnDate
			? "Expected return date is required"
			: expectedReturnDate < istTodayIso()
				? "Return date cannot be before today"
				: null;
	const firstLineError = lines.map(lineError).find((error) => error !== null);
	const formError = headerError ?? firstLineError ?? null;

	function onSubmit() {
		if (formError) {
			setShowErrors(true);
			return;
		}
		const lineInputs = lines.map(toLineInput);

		if (existing) {
			updateMutation.mutate(
				{
					scoId: existing.sco.id,
					expectedReturnDate,
					projectRef: projectRef.trim() || null,
					notes: notes.trim() || null,
					lines: lineInputs,
				},
				{
					onSuccess: (result) => {
						if (result.success)
							router.push(`/subcontracting/${existing.sco.id}`);
					},
				},
			);
			return;
		}

		createMutation.mutate(
			{
				vendorId: vendorId as number,
				expectedReturnDate,
				...(projectRef.trim() ? { projectRef: projectRef.trim() } : {}),
				...(notes.trim() ? { notes: notes.trim() } : {}),
				lines: lineInputs,
			},
			{
				onSuccess: (result) => {
					if (result.success)
						router.push(`/subcontracting/${result.data.sco.id}`);
				},
			},
		);
	}

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div>
				<h1 className="font-heading text-lg font-medium">
					{existing
						? `Edit ${existing.sco.scoNumber}`
						: "New subcontracting order"}
				</h1>
				<p className="text-xs text-muted-foreground">
					Price and GST come from the vendor's service list and can be changed
					while the order is a draft.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Header</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<div>
						<span className="mb-1 block text-xs font-medium">Vendor</span>
						{existing ? (
							<p className="flex h-9 items-center text-sm">
								{existing.sco.vendorName}
							</p>
						) : (
							<SearchableSelect
								value={vendorId ? String(vendorId) : undefined}
								options={vendorOptions}
								onValueChange={onVendorChange}
								searchValue={vendorSearch}
								onSearchChange={setVendorSearch}
								placeholder="Select vendor"
								searchPlaceholder="Search vendors"
								emptyText="No active service providers found."
								isLoading={suppliersQuery.isLoading}
							/>
						)}
					</div>
					<FloatingLabelInput
						id="sco-return-date"
						label="Expected return date"
						type="date"
						min={istTodayIso()}
						value={expectedReturnDate}
						onChange={(event) => setExpectedReturnDate(event.target.value)}
					/>
					<FloatingLabelInput
						id="sco-project-ref"
						label="Project reference (optional)"
						value={projectRef}
						onChange={(event) => setProjectRef(event.target.value)}
					/>
					<div>
						<Label htmlFor="sco-notes" className="mb-1 block text-xs">
							Notes (optional)
						</Label>
						<Textarea
							id="sco-notes"
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Lines</CardTitle>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setLines((current) => [...current, emptyLine()])}
					>
						<IconPlus className="size-3.5" />
						Add line
					</Button>
				</CardHeader>
				<CardContent className="space-y-4">
					{lines.map((line, index) => {
						const serviceOptions = vendorServices.map((row) => ({
							id: row.serviceId,
							name: row.serviceName,
						}));
						if (
							line.serviceId &&
							!serviceOptions.some((row) => row.id === line.serviceId)
						) {
							serviceOptions.unshift({
								id: line.serviceId,
								name: line.serviceLabel ?? `Service #${line.serviceId}`,
							});
						}
						const error = showErrors ? lineError(line) : null;

						return (
							<div key={line.key} className="space-y-3 rounded-lg border p-4">
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium">Line {index + 1}</span>
									{lines.length > 1 ? (
										<Button
											type="button"
											size="sm"
											variant="ghost"
											aria-label={`Remove line ${index + 1}`}
											onClick={() =>
												setLines((current) =>
													current.filter((entry) => entry.key !== line.key),
												)
											}
										>
											<IconTrash className="size-3.5" />
										</Button>
									) : null}
								</div>
								<div className="grid gap-3 md:grid-cols-3">
									<div>
										<span className="mb-1 block text-xs font-medium">
											Raw item (sent)
										</span>
										<ScoItemPicker
											value={line.rawItemId}
											valueLabel={line.rawItemLabel}
											placeholder="Select raw item"
											onChange={(id, label) =>
												updateLine(line.key, {
													rawItemId: id,
													rawItemLabel: label,
												})
											}
										/>
									</div>
									<div>
										<span className="mb-1 block text-xs font-medium">
											Finished item (returned)
										</span>
										<ScoItemPicker
											value={line.finishedItemId}
											valueLabel={line.finishedItemLabel}
											placeholder="Select finished item"
											onChange={(id, label) =>
												updateLine(line.key, {
													finishedItemId: id,
													finishedItemLabel: label,
												})
											}
										/>
									</div>
									<div>
										<Label
											htmlFor={`sco-service-${line.key}`}
											className="mb-1 block text-xs"
										>
											Service
										</Label>
										<Select
											value={
												line.serviceId ? String(line.serviceId) : undefined
											}
											onValueChange={(value) =>
												onServiceChange(line.key, Number(value))
											}
											disabled={!vendorId}
										>
											<SelectTrigger
												id={`sco-service-${line.key}`}
												className="w-full"
											>
												<SelectValue
													placeholder={
														vendorId ? "Select service" : "Pick a vendor first"
													}
												/>
											</SelectTrigger>
											<SelectContent>
												{serviceOptions.map((row) => (
													<SelectItem key={row.id} value={String(row.id)}>
														{row.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
									<FloatingLabelInput
										id={`sco-send-${line.key}`}
										label="Send qty (pcs)"
										type="number"
										min="1"
										step="1"
										value={line.sendQty}
										onChange={(event) =>
											updateLine(line.key, { sendQty: event.target.value })
										}
									/>
									<FloatingLabelInput
										id={`sco-return-${line.key}`}
										label="Return qty (pcs)"
										type="number"
										min="1"
										step="1"
										value={line.returnQty}
										onChange={(event) =>
											updateLine(line.key, { returnQty: event.target.value })
										}
									/>
									<FloatingLabelInput
										id={`sco-price-${line.key}`}
										label="Price per pc (₹)"
										type="number"
										min="0"
										step="0.01"
										value={line.priceRupees}
										onChange={(event) =>
											updateLine(line.key, { priceRupees: event.target.value })
										}
									/>
									<div>
										<Label
											htmlFor={`sco-gst-${line.key}`}
											className="mb-1 block text-xs"
										>
											GST %
										</Label>
										<Select
											value={line.gst}
											onValueChange={(value) =>
												updateLine(line.key, { gst: value })
											}
										>
											<SelectTrigger
												id={`sco-gst-${line.key}`}
												className="w-full"
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
									</div>
									<FloatingLabelInput
										id={`sco-batch-${line.key}`}
										label="Batch (optional)"
										value={line.batch}
										onChange={(event) =>
											updateLine(line.key, { batch: event.target.value })
										}
									/>
								</div>
								{error ? (
									<p className="text-xs text-destructive">{error}</p>
								) : null}
							</div>
						);
					})}
				</CardContent>
			</Card>

			<div className="flex flex-col items-end gap-1 text-sm">
				<span>Value: {formatPaise(totals.value)}</span>
				<span>GST: {formatPaise(totals.tax)}</span>
				<span className="font-medium">
					Total: {formatPaise(totals.value + totals.tax)}
				</span>
			</div>

			{showErrors && headerError ? (
				<p className="text-xs text-destructive">{headerError}</p>
			) : null}

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={isPending}
					onClick={() =>
						router.push(
							existing
								? `/subcontracting/${existing.sco.id}`
								: "/subcontracting",
						)
					}
				>
					Back
				</Button>
				<Button type="button" disabled={isPending} onClick={onSubmit}>
					{isPending ? "Saving..." : existing ? "Save changes" : "Create draft"}
				</Button>
			</div>
		</div>
	);
}
