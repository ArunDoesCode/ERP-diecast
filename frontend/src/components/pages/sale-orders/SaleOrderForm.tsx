"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { SoItemPicker } from "@/components/pages/sale-orders/SoItemPicker";
import {
	detailDocNumbers,
	errorDetails,
	paiseToRupees,
	rupeesToPaise,
} from "@/components/pages/sale-orders/so-format";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/client";
import { useCustomersQuery } from "@/lib/api/customers/queries";
import {
	soErrorMessage,
	useCreateSaleOrderMutation,
	useUpdateSaleOrderMutation,
} from "@/lib/api/sale-order/queries";
import { formatMoney } from "@/lib/format";
import { GST_STATES, stateLabel } from "@/types/customer";
import { todayIso } from "@/types/purchase-requisitions";
import {
	qtyDecimals,
	SO_ADDRESS_MAX,
	SO_GST_PERCENTS,
	SO_MAX_LINES,
	SO_NOTES_MAX,
	SO_PO_NUMBER_MAX,
	SO_PRICE_MAX_PAISE,
	SO_QTY_MAX,
	type SoCreatePayload,
	type SoDetail,
	type SoLineUpdateInput,
	type SoUpdatePayload,
} from "@/types/sale-order";

type LineState = {
	key: number;
	/** Present on lines that already exist on the server. */
	id?: number;
	itemId?: number;
	itemLabel?: string;
	uom: string;
	qty: string;
	price: string;
	deliveryDate: string;
	gst: string;
	notes: string;
	delivered: number;
};

let keySeed = 0;
function emptyLine(): LineState {
	keySeed += 1;
	return {
		key: keySeed,
		uom: "",
		qty: "",
		price: "",
		deliveryDate: "",
		gst: "0",
		notes: "",
		delivered: 0,
	};
}

function lineFromServer(line: SoDetail["lines"][number]): LineState {
	keySeed += 1;
	return {
		key: keySeed,
		id: line.id,
		itemId: line.itemId,
		itemLabel: `${line.sku} · ${line.itemName}`,
		uom: line.uom,
		qty: String(line.qty),
		price: paiseToRupees(line.unitPricePaise),
		deliveryDate: line.deliveryDate,
		gst: String(line.gstPercent),
		notes: line.notes ?? "",
		delivered: line.deliveredQty,
	};
}

function lineValuePaise(line: LineState) {
	const qty = Number(line.qty);
	const price = rupeesToPaise(line.price);
	if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
	return Math.round(qty * price);
}

function FormField({
	id,
	label,
	hint,
	error,
	children,
}: {
	id: string;
	label: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
}) {
	return (
		<div className="min-h-19 space-y-1">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{error ? (
				<p className="text-[13px] text-destructive">{error}</p>
			) : hint ? (
				<p className="text-[13px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

type Props = {
	existing?: SoDetail;
	/** Refetch the order after STALE_VERSION. */
	onReload?: () => void;
};

/** Below 1100 px the line table stacks: one card per line, labels from data-label. */
const STACK_TABLE =
	"max-[1099px]:block max-[1099px]:[&_tbody]:block max-[1099px]:[&_tfoot]:block";
const STACK_ROW =
	"max-[1099px]:grid max-[1099px]:grid-cols-2 max-[1099px]:gap-x-3 max-[1099px]:gap-y-4 max-[1099px]:p-3";
const CELL =
	"max-[1099px]:block max-[1099px]:p-0 max-[1099px]:before:mb-1 max-[1099px]:before:block max-[1099px]:before:text-[13px] max-[1099px]:before:text-muted-foreground max-[1099px]:before:content-[attr(data-label)]";

export function SaleOrderForm({ existing, onReload }: Props) {
	const router = useRouter();
	const createMutation = useCreateSaleOrderMutation();
	const updateMutation = useUpdateSaleOrderMutation(existing?.id ?? 0);
	const isPending = createMutation.isPending || updateMutation.isPending;
	const confirmedEdit = existing?.status === "confirmed";
	const today = todayIso();

	const customers = useCustomersQuery({
		page: 1,
		pageSize: 100,
		sortBy: "name",
		sortDir: "asc",
		isActive: true,
	});
	const customerOptions = useMemo(() => {
		const list = (customers.data?.data ?? []).map((c) => ({
			id: c.id,
			name: c.name,
		}));
		if (existing && !list.some((c) => c.id === existing.customerId)) {
			list.unshift({ id: existing.customerId, name: existing.customerName });
		}
		return list;
	}, [customers.data, existing]);

	const [customerId, setCustomerId] = useState<number | undefined>(
		existing?.customerId,
	);
	const [orderDate, setOrderDate] = useState(existing?.orderDate ?? today);
	const [poNumber, setPoNumber] = useState(existing?.customerPoNumber ?? "");
	const [poDate, setPoDate] = useState(existing?.customerPoDate ?? "");
	const [notes, setNotes] = useState(existing?.notes ?? "");
	const [shipDifferent, setShipDifferent] = useState(
		Boolean(existing?.shipToAddress),
	);
	const [shipAddress, setShipAddress] = useState(existing?.shipToAddress ?? "");
	const [shipState, setShipState] = useState(existing?.shipToStateCode ?? "");
	const [lines, setLines] = useState<LineState[]>(() =>
		existing && existing.lines.length > 0
			? existing.lines.map(lineFromServer)
			: [emptyLine()],
	);
	const [removedIds, setRemovedIds] = useState<number[]>([]);

	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [banner, setBanner] = useState<{
		message: string;
		numbers: string[];
		stale: boolean;
	} | null>(null);

	function patchLine(key: number, patch: Partial<LineState>) {
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
		);
	}

	function removeLine(line: LineState) {
		if (line.id !== undefined) {
			const id = line.id;
			setRemovedIds((current) => [...current, id]);
		}
		setLines((current) => current.filter((entry) => entry.key !== line.key));
	}

	const total = lines.reduce((sum, line) => sum + lineValuePaise(line), 0);

	function validate() {
		const errors: Record<string, string> = {};
		if (!customerId) errors.customer = "Pick a customer";
		if (!orderDate) errors.orderDate = "Pick the order date";
		else if (orderDate > today)
			errors.orderDate = "Order date cannot be in the future";
		if (shipDifferent && shipAddress.trim() && !shipState) {
			errors.shipState = "Pick the ship-to state";
		}
		if (lines.length === 0) errors.lines = "Add at least one line";
		lines.forEach((line, index) => {
			const row = index + 1;
			const qty = Number(line.qty);
			const price = rupeesToPaise(line.price);
			if (!line.itemId)
				errors[`line-${line.key}`] = `Line ${row}: pick an item`;
			else if (!line.qty.trim() || !Number.isFinite(qty) || qty <= 0)
				errors[`line-${line.key}`] = `Line ${row}: enter a quantity above 0`;
			else if (qty > SO_QTY_MAX)
				errors[`line-${line.key}`] = `Line ${row}: quantity is too large`;
			else if (qtyDecimals(line.uom) === 0 && !Number.isInteger(qty))
				errors[`line-${line.key}`] =
					`Line ${row}: quantity must be a whole number`;
			else if (line.id !== undefined && qty < line.delivered)
				errors[`line-${line.key}`] =
					`Line ${row}: quantity is below what was delivered`;
			else if (
				!Number.isFinite(price) ||
				price < 0 ||
				price > SO_PRICE_MAX_PAISE
			)
				errors[`line-${line.key}`] = `Line ${row}: enter a valid unit price`;
			else if (!line.deliveryDate)
				errors[`line-${line.key}`] = `Line ${row}: pick a delivery date`;
		});
		return errors;
	}

	function onError(error: unknown) {
		if (error instanceof ApiClientError) {
			if (error.code === "CUSTOMER_PO_EXISTS") {
				setFieldErrors({ poNumber: error.message });
				setBanner(null);
				return;
			}
			setBanner({
				message: error.message,
				numbers: detailDocNumbers(errorDetails(error)),
				stale: error.code === "STALE_VERSION",
			});
			return;
		}
		setBanner({
			message: soErrorMessage(error, "Could not save the sale order."),
			numbers: [],
			stale: false,
		});
	}

	function lineInput(line: LineState) {
		return {
			qty: Number(line.qty),
			unitPricePaise: rupeesToPaise(line.price),
			gstPercent: Number(line.gst),
			deliveryDate: line.deliveryDate,
			...(line.notes.trim() ? { notes: line.notes.trim() } : {}),
		};
	}

	function buildUpdate(base: SoDetail): SoUpdatePayload {
		const payload: SoUpdatePayload = { editVersion: base.editVersion };
		if (customerId !== undefined && customerId !== base.customerId)
			payload.customerId = customerId;
		if (orderDate !== base.orderDate) payload.orderDate = orderDate;
		if (poNumber.trim() !== (base.customerPoNumber ?? ""))
			payload.customerPoNumber =
				poNumber.trim() === "" ? null : poNumber.trim();
		if (poDate && poDate !== (base.customerPoDate ?? ""))
			payload.customerPoDate = poDate;
		if (notes.trim() !== (base.notes ?? "")) payload.notes = notes.trim();
		const address = shipDifferent ? shipAddress.trim() : "";
		if (
			address !== "" &&
			(address !== (base.shipToAddress ?? "") ||
				shipState !== (base.shipToStateCode ?? ""))
		) {
			payload.shipToAddress = address;
			payload.shipToStateCode = shipState;
		}
		// Only lines that changed or are new are sent; untouched lines stay (contract).
		const changed: SoLineUpdateInput[] = [];
		for (const line of lines) {
			if (line.id === undefined) {
				changed.push({ itemId: line.itemId, ...lineInput(line) });
				continue;
			}
			const old = base.lines.find((entry) => entry.id === line.id);
			if (!old) continue;
			const next = lineInput(line);
			const same =
				next.qty === old.qty &&
				next.unitPricePaise === old.unitPricePaise &&
				next.gstPercent === old.gstPercent &&
				next.deliveryDate === old.deliveryDate &&
				(next.notes ?? "") === (old.notes ?? "");
			if (!same) changed.push({ id: line.id, ...next });
		}
		if (changed.length > 0) payload.lines = changed;
		if (removedIds.length > 0) payload.removeLineIds = removedIds;
		return payload;
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		setBanner(null);
		const errors = validate();
		setFieldErrors(errors);
		if (Object.keys(errors).length > 0) return;

		if (existing) {
			const payload = buildUpdate(existing);
			if (Object.keys(payload).length === 1) {
				router.push(`/sale-orders/${existing.id}`);
				return;
			}
			updateMutation.mutate(payload, {
				onSuccess: () => router.push(`/sale-orders/${existing.id}`),
				onError,
			});
			return;
		}
		const payload: SoCreatePayload = {
			customerId: customerId as number,
			orderDate,
			...(poNumber.trim() ? { customerPoNumber: poNumber.trim() } : {}),
			...(poDate ? { customerPoDate: poDate } : {}),
			...(notes.trim() ? { notes: notes.trim() } : {}),
			...(shipDifferent && shipAddress.trim()
				? { shipToAddress: shipAddress.trim(), shipToStateCode: shipState }
				: {}),
			lines: lines.map((line) => ({
				itemId: line.itemId as number,
				...lineInput(line),
			})),
		};
		createMutation.mutate(payload, {
			onSuccess: (result) => router.push(`/sale-orders/${result.data.id}`),
			onError,
		});
	}

	const cancelHref = existing ? `/sale-orders/${existing.id}` : "/sale-orders";
	const customerName = customerOptions.find((c) => c.id === customerId)?.name;
	const lineErrors = Object.entries(fieldErrors).filter(([key]) =>
		key.startsWith("line"),
	);

	return (
		<form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
			<PageHeader
				title={existing ? `Edit ${existing.soNumber}` : "New sale order"}
			/>

			{banner ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					<span>{banner.message}</span>
					{banner.numbers.length > 0 ? (
						<span className="font-mono">{banner.numbers.join(", ")}</span>
					) : null}
					{banner.stale && onReload ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={onReload}
						>
							Reload
						</Button>
					) : null}
				</div>
			) : null}

			<div className="grid max-w-5xl gap-x-4 gap-y-2 md:grid-cols-3">
				<FormField
					id="so-customer"
					label="Customer *"
					error={fieldErrors.customer}
				>
					{confirmedEdit ? (
						<p id="so-customer" className="flex h-9 items-center text-sm">
							{customerName ?? existing?.customerName}
						</p>
					) : (
						<Select
							value={customerId ? String(customerId) : ""}
							onValueChange={(value) => setCustomerId(Number(value))}
						>
							<SelectTrigger id="so-customer" className="w-full">
								<SelectValue placeholder="Pick a customer" />
							</SelectTrigger>
							<SelectContent>
								{customerOptions.map((customer) => (
									<SelectItem key={customer.id} value={String(customer.id)}>
										{customer.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</FormField>
				<FormField
					id="so-order-date"
					label="Order date *"
					error={fieldErrors.orderDate}
				>
					<Input
						id="so-order-date"
						type="date"
						max={today}
						value={orderDate}
						onChange={(event) => setOrderDate(event.target.value)}
					/>
				</FormField>
				<FormField
					id="so-po-number"
					label="Customer PO no."
					error={fieldErrors.poNumber}
				>
					<Input
						id="so-po-number"
						value={poNumber}
						maxLength={SO_PO_NUMBER_MAX}
						onChange={(event) => setPoNumber(event.target.value)}
					/>
				</FormField>
				<FormField id="so-po-date" label="Customer PO date">
					<Input
						id="so-po-date"
						type="date"
						value={poDate}
						onChange={(event) => setPoDate(event.target.value)}
					/>
				</FormField>
				<div className="md:col-span-2">
					<FormField id="so-notes" label="Notes">
						<Textarea
							id="so-notes"
							value={notes}
							maxLength={SO_NOTES_MAX}
							onChange={(event) => setNotes(event.target.value)}
						/>
					</FormField>
				</div>
				<div className="flex min-h-19 items-start gap-2 md:col-span-3">
					<Checkbox
						id="so-ship-different"
						checked={shipDifferent}
						onCheckedChange={(checked) => setShipDifferent(checked === true)}
						className="mt-1"
					/>
					<Label htmlFor="so-ship-different">Ship to a different address</Label>
				</div>
				{shipDifferent ? (
					<>
						<div className="md:col-span-2">
							<FormField
								id="so-ship-address"
								label="Ship-to address"
								hint="Empty means the customer address is used"
							>
								<Textarea
									id="so-ship-address"
									value={shipAddress}
									maxLength={SO_ADDRESS_MAX}
									onChange={(event) => setShipAddress(event.target.value)}
								/>
							</FormField>
						</div>
						<FormField
							id="so-ship-state"
							label={shipAddress.trim() ? "Ship-to state *" : "Ship-to state"}
							error={fieldErrors.shipState}
						>
							<Select value={shipState} onValueChange={setShipState}>
								<SelectTrigger id="so-ship-state" className="w-full">
									<SelectValue placeholder="Pick a state" />
								</SelectTrigger>
								<SelectContent>
									{GST_STATES.map((state) => (
										<SelectItem key={state.code} value={state.code}>
											{stateLabel(state)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					</>
				) : null}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{fieldErrors.lines ? (
						<p role="alert" className="text-[13px] text-destructive">
							{fieldErrors.lines}
						</p>
					) : null}
					{lineErrors.length > 0 ? (
						<ul role="alert" className="text-[13px] text-destructive">
							{lineErrors.map(([key, message]) => (
								<li key={key}>{message}</li>
							))}
						</ul>
					) : null}
					<Table className={STACK_TABLE}>
						<TableHeader className="max-[1099px]:hidden">
							<TableRow>
								<TableHead className="w-8">#</TableHead>
								<TableHead className="min-w-56">Item *</TableHead>
								<TableHead>Unit</TableHead>
								<TableHead className="min-w-28 text-right">Qty *</TableHead>
								{confirmedEdit ? (
									<TableHead className="text-right">Delivered</TableHead>
								) : null}
								<TableHead className="min-w-32 text-right">
									Unit price (₹) *
								</TableHead>
								<TableHead className="min-w-40">Delivery date *</TableHead>
								<TableHead className="min-w-24">GST % *</TableHead>
								<TableHead className="text-right">Line value</TableHead>
								<TableHead className="w-10">
									<span className="sr-only">Remove</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{lines.map((line, index) => {
								const row = index + 1;
								const locked = line.id !== undefined && confirmedEdit;
								return (
									<TableRow key={line.key} className={STACK_ROW}>
										<TableCell
											className={`tabular-nums ${CELL} max-[1099px]:hidden`}
										>
											{row}
										</TableCell>
										<TableCell
											data-label="Item"
											className={`${CELL} max-[1099px]:col-span-2`}
										>
											{locked ? (
												<span>{line.itemLabel}</span>
											) : (
												<SoItemPicker
													value={line.itemId}
													valueLabel={line.itemLabel}
													onChange={(item) =>
														patchLine(line.key, {
															itemId: item.id,
															itemLabel: `${item.sku} · ${item.name}`,
															uom: item.uom,
														})
													}
												/>
											)}
										</TableCell>
										<TableCell data-label="Unit" className={CELL}>
											{line.uom || "–"}
										</TableCell>
										<TableCell data-label="Qty" className={CELL}>
											<Input
												aria-label={`Quantity, line ${row}`}
												inputMode="decimal"
												className="text-right tabular-nums"
												value={line.qty}
												onChange={(event) =>
													patchLine(line.key, { qty: event.target.value })
												}
											/>
										</TableCell>
										{confirmedEdit ? (
											<TableCell
												data-label="Delivered"
												className={`text-right tabular-nums ${CELL}`}
											>
												{line.delivered}
											</TableCell>
										) : null}
										<TableCell data-label="Unit price (₹)" className={CELL}>
											<Input
												aria-label={`Unit price, line ${row}`}
												inputMode="decimal"
												className="text-right tabular-nums"
												value={line.price}
												onChange={(event) =>
													patchLine(line.key, { price: event.target.value })
												}
											/>
										</TableCell>
										<TableCell data-label="Delivery date" className={CELL}>
											<Input
												aria-label={`Delivery date, line ${row}`}
												type="date"
												min={line.id === undefined ? today : undefined}
												value={line.deliveryDate}
												onChange={(event) =>
													patchLine(line.key, {
														deliveryDate: event.target.value,
													})
												}
											/>
										</TableCell>
										<TableCell data-label="GST %" className={CELL}>
											<Select
												value={line.gst}
												onValueChange={(value) =>
													patchLine(line.key, { gst: value })
												}
											>
												<SelectTrigger
													aria-label={`GST percent, line ${row}`}
													className="w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{SO_GST_PERCENTS.map((percent) => (
														<SelectItem key={percent} value={String(percent)}>
															{percent}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</TableCell>
										<TableCell
											data-label="Line value"
											className={`text-right tabular-nums ${CELL}`}
										>
											{formatMoney(lineValuePaise(line))}
										</TableCell>
										<TableCell className="max-[1099px]:col-span-2 max-[1099px]:justify-self-end">
											{line.delivered > 0 ? null : (
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label={`Remove line ${row}`}
													onClick={() => removeLine(line)}
												>
													<IconTrash />
												</Button>
											)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
						<TableFooter>
							<TableRow className="max-[1099px]:flex max-[1099px]:justify-between max-[1099px]:p-3">
								<TableCell
									colSpan={confirmedEdit ? 8 : 7}
									className="text-right font-medium"
								>
									SO value (calculated)
								</TableCell>
								<TableCell className="text-right font-bold tabular-nums">
									{formatMoney(total)}
								</TableCell>
								<TableCell className="max-[1099px]:hidden" />
							</TableRow>
						</TableFooter>
					</Table>
					<p className="text-[13px] text-muted-foreground">
						GST % is stored for dispatch only; no tax is shown on the order.
					</p>
					<div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={lines.length >= SO_MAX_LINES}
							onClick={() => setLines((current) => [...current, emptyLine()])}
						>
							<IconPlus />
							Add line
						</Button>
					</div>
				</CardContent>
			</Card>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isPending}
					asChild
				>
					<Link href={cancelHref}>Cancel</Link>
				</Button>
				<Button type="submit" size="sm" disabled={isPending}>
					{isPending
						? "Saving…"
						: confirmedEdit
							? "Save changes"
							: "Save draft"}
				</Button>
			</div>
		</form>
	);
}
