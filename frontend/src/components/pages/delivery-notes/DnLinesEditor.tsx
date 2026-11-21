"use client";

import { lineQtyError } from "@/components/pages/delivery-notes/dn-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	lineGstPaise,
	lineTaxablePaise,
	type NoteTotals,
} from "@/lib/delivery-note-math";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { DN_LOT_MAX, dnQtyDecimals } from "@/types/delivery-note";

export type DnLineInfo = {
	soLineId: number;
	sku: string;
	name: string;
	uom: string;
	deliveryDate: string;
	/** null for a line that is on the draft but no longer listed as open on the order. */
	ordered: number | null;
	delivered: number | null;
	open: number;
	stock: number | null;
	unitPricePaise?: number;
	gstPercent?: number;
};

export type DnLineState = { picked: boolean; qty: string; lot: string };

type Props = {
	infos: DnLineInfo[];
	states: Record<number, DnLineState>;
	wide: boolean;
	showMoney: boolean;
	totals: NoteTotals | null;
	showErrors: boolean;
	disabled: boolean;
	/** Server errors by SO line id. */
	serverErrors: Record<number, string>;
	onToggle: (info: DnLineInfo, picked: boolean) => void;
	onQty: (soLineId: number, qty: string) => void;
	onLot: (soLineId: number, lot: string) => void;
};

function lineValue(info: DnLineInfo, state: DnLineState | undefined) {
	if (
		!state?.picked ||
		info.unitPricePaise === undefined ||
		info.gstPercent === undefined
	) {
		return null;
	}
	const qty = Number(state.qty);
	if (!Number.isFinite(qty) || qty <= 0) return null;
	const taxable = lineTaxablePaise(qty, info.unitPricePaise);
	return taxable + lineGstPaise(taxable, info.gstPercent);
}

function rowProblems(
	info: DnLineInfo,
	state: DnLineState | undefined,
	showErrors: boolean,
	serverErrors: Record<number, string>,
) {
	const picked = state?.picked === true;
	const qtyProblem =
		serverErrors[info.soLineId] ??
		(picked && (showErrors || (state?.qty.trim() ?? "") !== "")
			? lineQtyError(state?.qty ?? "", info.uom, info.open)
			: null);
	const qty = Number(state?.qty);
	const overStock =
		picked &&
		info.stock !== null &&
		Number.isFinite(qty) &&
		qty > info.stock + 1e-9;
	return { qtyProblem, overStock };
}

function QtyInput({
	info,
	state,
	disabled,
	invalid,
	onQty,
}: {
	info: DnLineInfo;
	state: DnLineState | undefined;
	disabled: boolean;
	invalid: boolean;
	onQty: (soLineId: number, qty: string) => void;
}) {
	return (
		<div className="flex items-center justify-end gap-1.5">
			<Input
				id={`dn-qty-${info.soLineId}`}
				aria-label={`Qty to ship ${info.sku}`}
				className="h-10 w-28 text-right tabular-nums"
				inputMode={dnQtyDecimals(info.uom) === 0 ? "numeric" : "decimal"}
				value={state?.qty ?? ""}
				disabled={disabled || !state?.picked}
				aria-invalid={invalid || undefined}
				onChange={(event) => onQty(info.soLineId, event.target.value)}
			/>
			<span className="text-[13px] text-muted-foreground">{info.uom}</span>
		</div>
	);
}

function Problems({
	info,
	qtyProblem,
	overStock,
}: {
	info: DnLineInfo;
	qtyProblem: string | null;
	overStock: boolean;
}) {
	return (
		<>
			{qtyProblem ? (
				<p className="text-[13px] text-destructive">
					{info.sku}: {qtyProblem}
				</p>
			) : null}
			{overStock ? (
				<p className="text-[13px] text-warning">
					Stock here: {formatQty(info.stock, null, dnQtyDecimals(info.uom))}.
					Posting will be refused.
				</p>
			) : null}
		</>
	);
}

export function DnLinesEditor(props: Props) {
	const { infos, states, wide, showMoney, totals } = props;
	if (infos.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No lines are open on this order.
			</p>
		);
	}
	const dec = (info: DnLineInfo) => dnQtyDecimals(info.uom);

	if (!wide) {
		return (
			<div className="flex flex-col gap-3">
				<ul className="flex flex-col gap-3">
					{infos.map((info) => {
						const state = states[info.soLineId];
						const { qtyProblem, overStock } = rowProblems(
							info,
							state,
							props.showErrors,
							props.serverErrors,
						);
						const value = showMoney ? lineValue(info, state) : null;
						return (
							<li
								key={info.soLineId}
								className="flex flex-col gap-2 rounded-md border p-3"
							>
								<div className="flex items-start gap-2">
									<Checkbox
										id={`dn-pick-${info.soLineId}`}
										aria-label={`Ship ${info.sku}`}
										checked={state?.picked === true}
										disabled={props.disabled}
										onCheckedChange={(checked) =>
											props.onToggle(info, checked === true)
										}
									/>
									<div className="min-w-0">
										<p className="font-mono text-sm">{info.sku}</p>
										<p className="text-sm text-muted-foreground">{info.name}</p>
										{info.stock !== null && info.stock < info.open ? (
											<StatusBadge doc="dnTag" status="short_stock" />
										) : null}
									</div>
								</div>
								<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
									<dt className="text-muted-foreground">Delivery date</dt>
									<dd className="text-right">
										{formatDate(info.deliveryDate)}
									</dd>
									<dt className="text-muted-foreground">Ordered</dt>
									<dd className="text-right tabular-nums">
										{info.ordered === null
											? "–"
											: formatQty(info.ordered, info.uom, dec(info))}
									</dd>
									<dt className="text-muted-foreground">Delivered</dt>
									<dd className="text-right tabular-nums">
										{info.delivered === null
											? "–"
											: formatQty(info.delivered, info.uom, dec(info))}
									</dd>
									<dt className="text-muted-foreground">Open</dt>
									<dd className="text-right font-medium tabular-nums">
										{formatQty(info.open, info.uom, dec(info))}
									</dd>
									<dt className="text-muted-foreground">Stock here</dt>
									<dd className="text-right tabular-nums">
										{info.stock === null
											? "–"
											: formatQty(info.stock, info.uom, dec(info))}
									</dd>
									{value !== null ? (
										<>
											<dt className="text-muted-foreground">Line value</dt>
											<dd className="text-right tabular-nums">
												{formatMoney(value)}
											</dd>
										</>
									) : null}
								</dl>
								<div className="grid gap-2 sm:grid-cols-2">
									<div className="space-y-1">
										<Label htmlFor={`dn-qty-${info.soLineId}`}>
											Qty to ship *
										</Label>
										<QtyInput
											info={info}
											state={state}
											disabled={props.disabled}
											invalid={qtyProblem !== null}
											onQty={props.onQty}
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor={`dn-lot-${info.soLineId}`}>
											Lot / heat no.
										</Label>
										<Input
											id={`dn-lot-${info.soLineId}`}
											className="h-10"
											value={state?.lot ?? ""}
											maxLength={DN_LOT_MAX}
											disabled={props.disabled || !state?.picked}
											onChange={(event) =>
												props.onLot(info.soLineId, event.target.value)
											}
										/>
									</div>
								</div>
								<Problems
									info={info}
									qtyProblem={qtyProblem}
									overStock={overStock}
								/>
							</li>
						);
					})}
				</ul>
				{showMoney && totals ? <TotalsBlock totals={totals} /> : null}
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-10">
						<span className="sr-only">Ship</span>
					</TableHead>
					<TableHead>Item</TableHead>
					<TableHead>Delivery</TableHead>
					<TableHead className="text-right">Ordered</TableHead>
					<TableHead className="text-right">Delivered</TableHead>
					<TableHead className="text-right">Open</TableHead>
					<TableHead className="text-right">Stock here</TableHead>
					<TableHead className="text-right">Qty to ship *</TableHead>
					<TableHead>Lot / heat no.</TableHead>
					{showMoney ? (
						<TableHead className="text-right">Line value</TableHead>
					) : null}
				</TableRow>
			</TableHeader>
			<TableBody>
				{infos.map((info) => {
					const state = states[info.soLineId];
					const { qtyProblem, overStock } = rowProblems(
						info,
						state,
						props.showErrors,
						props.serverErrors,
					);
					const value = showMoney ? lineValue(info, state) : null;
					return (
						<TableRow key={info.soLineId} className="align-top">
							<TableCell>
								<Checkbox
									aria-label={`Ship ${info.sku}`}
									checked={state?.picked === true}
									disabled={props.disabled}
									onCheckedChange={(checked) =>
										props.onToggle(info, checked === true)
									}
								/>
							</TableCell>
							<TableCell className="whitespace-normal">
								<span className="font-mono">{info.sku}</span>
								<span className="block text-[13px] text-muted-foreground">
									{info.name}
								</span>
								<Problems
									info={info}
									qtyProblem={qtyProblem}
									overStock={overStock}
								/>
							</TableCell>
							<TableCell>{formatDate(info.deliveryDate)}</TableCell>
							<TableCell className="text-right tabular-nums">
								{info.ordered === null
									? "–"
									: formatQty(info.ordered, null, dec(info))}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{info.delivered === null
									? "–"
									: formatQty(info.delivered, null, dec(info))}
							</TableCell>
							<TableCell className="text-right font-medium tabular-nums">
								{formatQty(info.open, null, dec(info))}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{info.stock === null ? (
									"–"
								) : (
									<span className="inline-flex flex-col items-end gap-1">
										{formatQty(info.stock, null, dec(info))}
										{info.stock < info.open ? (
											<StatusBadge doc="dnTag" status="short_stock" />
										) : null}
									</span>
								)}
							</TableCell>
							<TableCell>
								<QtyInput
									info={info}
									state={state}
									disabled={props.disabled}
									invalid={qtyProblem !== null}
									onQty={props.onQty}
								/>
							</TableCell>
							<TableCell>
								<Input
									aria-label={`Lot or heat no. ${info.sku}`}
									className="h-10 w-36"
									value={state?.lot ?? ""}
									maxLength={DN_LOT_MAX}
									disabled={props.disabled || !state?.picked}
									onChange={(event) =>
										props.onLot(info.soLineId, event.target.value)
									}
								/>
							</TableCell>
							{showMoney ? (
								<TableCell className="text-right tabular-nums">
									{value === null ? "–" : formatMoney(value)}
								</TableCell>
							) : null}
						</TableRow>
					);
				})}
			</TableBody>
			{showMoney && totals ? (
				<TableFooter>
					<TableRow>
						<TableCell colSpan={9} className="text-right">
							<TotalsBlock totals={totals} inline />
						</TableCell>
						<TableCell className="text-right font-medium tabular-nums">
							{formatMoney(totals.valuePaise)}
						</TableCell>
					</TableRow>
				</TableFooter>
			) : null}
		</Table>
	);
}

function TotalsBlock({
	totals,
	inline,
}: {
	totals: NoteTotals;
	inline?: boolean;
}) {
	if (inline) {
		return (
			<span className="text-[13px] text-muted-foreground">
				Taxable {formatMoney(totals.taxablePaise)} · GST{" "}
				{formatMoney(totals.gstPaise)} · Note value
			</span>
		);
	}
	return (
		<dl className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-right text-sm">
			<dt className="text-muted-foreground">Taxable</dt>
			<dd className="tabular-nums">{formatMoney(totals.taxablePaise)}</dd>
			<dt className="text-muted-foreground">GST</dt>
			<dd className="tabular-nums">{formatMoney(totals.gstPaise)}</dd>
			<dt className="font-medium">Note value</dt>
			<dd className="font-medium tabular-nums">
				{formatMoney(totals.valuePaise)}
			</dd>
		</dl>
	);
}
