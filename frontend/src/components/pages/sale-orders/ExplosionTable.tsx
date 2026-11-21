"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { Fragment, useState } from "react";

import {
	type CanRaise,
	isPickable,
	planText,
	type RowPick,
	soRowTagKey,
} from "@/components/pages/sale-orders/explosion-helpers";
import { raisedDocHref } from "@/components/pages/sale-orders/so-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatQty } from "@/lib/format";
import {
	qtyDecimals,
	type SoExplosionRow,
	soRowTypeLabels,
} from "@/types/sale-order";

const NUM = "text-right tabular-nums";

type Props = {
	rows: SoExplosionRow[];
	loading: boolean;
	picks: Map<number, RowPick>;
	allowed: CanRaise;
	/** Run is current and not out of date: pick boxes may show. */
	runOpen: boolean;
	onToggle: (row: SoExplosionRow, picked: boolean) => void;
	onToggleAll: (picked: boolean) => void;
	onChangePick: (rowId: number, patch: Partial<RowPick>) => void;
};

function qty(row: SoExplosionRow, value: number) {
	return formatQty(value, null, qtyDecimals(row.uom));
}

export function ExplosionTable({
	rows,
	loading,
	picks,
	allowed,
	runOpen,
	onToggle,
	onToggleAll,
	onChangePick,
}: Props) {
	const [open, setOpen] = useState<Set<number>>(new Set());
	const pickable = rows.filter((row) => isPickable(row, allowed, runOpen));
	const pickedOnPage = pickable.filter((row) => picks.has(row.id)).length;
	const allChecked =
		pickable.length > 0 && pickedOnPage === pickable.length
			? true
			: pickedOnPage > 0
				? "indeterminate"
				: false;

	return (
		<Table aria-busy={loading || undefined}>
			<TableHeader>
				<TableRow>
					<TableHead className="sticky left-0 z-10 w-10 bg-table-header">
						{pickable.length > 0 ? (
							<Checkbox
								aria-label="Select all rows on this page"
								checked={allChecked}
								onCheckedChange={(checked) => onToggleAll(checked === true)}
							/>
						) : (
							<span className="sr-only">Pick</span>
						)}
					</TableHead>
					<TableHead className="sticky left-10 z-10 min-w-56 bg-table-header">
						Item
					</TableHead>
					<TableHead className="min-w-32">Type</TableHead>
					<TableHead>Rev</TableHead>
					<TableHead className={NUM}>Gross</TableHead>
					<TableHead className={NUM}>Free</TableHead>
					<TableHead className={NUM}>Reserved</TableHead>
					<TableHead className={NUM}>Open PR</TableHead>
					<TableHead className={NUM}>Open PO</TableHead>
					<TableHead className={NUM}>Open SCO</TableHead>
					<TableHead className={NUM}>Net</TableHead>
					<TableHead className="min-w-44">Raise</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading
					? Array.from({ length: 8 }, (_, index) => (
							<TableRow key={`skeleton-${index + 1}`}>
								<TableCell colSpan={12}>
									<Skeleton className="h-5 w-full" />
								</TableCell>
							</TableRow>
						))
					: rows.map((row) => {
							const tag = soRowTagKey(row);
							const pickState = picks.get(row.id);
							const canPick = isPickable(row, allowed, runOpen);
							const expanded = open.has(row.id);
							const plan = planText(row);
							const net = row.netQty;
							const pickQty = pickState ? Number(pickState.qty) : Number.NaN;
							const over = pickState !== undefined && pickQty > net;
							const short =
								pickState !== undefined &&
								Number.isFinite(pickQty) &&
								pickQty > 0 &&
								pickQty < net;
							const sourcesId = `explosion-sources-${row.id}`;
							return (
								<Fragment key={row.id}>
									<TableRow>
										<TableCell className="sticky left-0 z-10 bg-card">
											{canPick ? (
												<Checkbox
													aria-label={`Pick ${row.sku}`}
													checked={pickState !== undefined}
													onCheckedChange={(checked) =>
														onToggle(row, checked === true)
													}
												/>
											) : null}
										</TableCell>
										<TableCell className="sticky left-10 z-10 bg-card">
											<div
												className="flex items-center gap-1"
												style={{ paddingLeft: `${(row.level - 1) * 12}px` }}
											>
												{row.sources.length > 0 ? (
													<Button
														type="button"
														size="icon-sm"
														variant="ghost"
														aria-label={`Needed by, ${row.sku}`}
														aria-expanded={expanded}
														aria-controls={sourcesId}
														onClick={() =>
															setOpen((current) => {
																const next = new Set(current);
																if (next.has(row.id)) next.delete(row.id);
																else next.add(row.id);
																return next;
															})
														}
													>
														{expanded ? (
															<IconChevronDown />
														) : (
															<IconChevronRight />
														)}
													</Button>
												) : (
													<span
														className="inline-block size-8 shrink-0"
														aria-hidden="true"
													/>
												)}
												<span className="font-mono">{row.sku}</span>
												<span className="rounded-sm bg-muted px-1.5 text-[12px] text-muted-foreground">
													L{row.level}
												</span>
												<span className="text-muted-foreground">
													{row.name}
												</span>
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col items-start gap-1">
												<span>{soRowTypeLabels[row.type]}</span>
												{tag ? (
													<StatusBadge doc="soRowTag" status={tag} />
												) : null}
												{tag === "no_bom" ? (
													<span className="text-[13px] text-muted-foreground">
														Fix BOM and re-run
													</span>
												) : null}
											</div>
										</TableCell>
										<TableCell>{row.bomRevision ?? "–"}</TableCell>
										<TableCell className={NUM}>
											{qty(row, row.grossQty)}
										</TableCell>
										<TableCell className={NUM}>
											{qty(row, row.freeQty)}
										</TableCell>
										<TableCell className={NUM}>
											{qty(row, row.reservedOtherQty)}
										</TableCell>
										<TableCell className={NUM}>
											{qty(row, row.openPrQty)}
										</TableCell>
										<TableCell className={NUM}>
											<div>{qty(row, row.openPoQty)}</div>
											{row.lateSupplyQty > 0 ? (
												<div className="text-[13px] text-muted-foreground">
													+{qty(row, row.lateSupplyQty)} late
												</div>
											) : null}
										</TableCell>
										<TableCell className={NUM}>
											{qty(row, row.openScoQty)}
										</TableCell>
										<TableCell className={`${NUM} font-bold`}>
											{qty(row, net)}
										</TableCell>
										<TableCell>
											{row.raised ? (
												<Link
													href={raisedDocHref({
														type: row.raised.type,
														id: row.raised.docId,
													})}
													className="font-mono text-brand-accent hover:underline"
												>
													{row.raised.docNumber}
												</Link>
											) : pickState ? (
												<div className="flex flex-col gap-1">
													<Input
														aria-label="Qty to raise"
														aria-invalid={over || undefined}
														inputMode="decimal"
														className="text-right tabular-nums"
														value={pickState.qty}
														onChange={(event) =>
															onChangePick(row.id, { qty: event.target.value })
														}
													/>
													{over ? (
														<span className="text-[13px] text-destructive">
															Can't be more than net{" "}
															{formatQty(net, row.uom, qtyDecimals(row.uom))}
														</span>
													) : short ? (
														<span className="text-[13px] text-muted-foreground">
															still short by{" "}
															{formatQty(
																net - pickQty,
																row.uom,
																qtyDecimals(row.uom),
															)}
														</span>
													) : null}
												</div>
											) : row.blockReason || tag === "no_bom" ? null : plan ? (
												<span className="text-[13px] text-muted-foreground">
													{plan}
												</span>
											) : net <= 0 ? (
												<span className="text-[13px] text-muted-foreground">
													Covered
												</span>
											) : null}
										</TableCell>
									</TableRow>
									{expanded ? (
										<TableRow id={sourcesId}>
											<TableCell />
											<TableCell
												colSpan={11}
												className="text-[13px] text-muted-foreground"
											>
												Needed by:{" "}
												{row.sources
													.map(
														(source) =>
															`${source.sourceSku} L${source.sourceLevel} (line ${source.lineNo}, ${source.qty})`,
													)
													.join(" · ")}
											</TableCell>
										</TableRow>
									) : null}
									{pickState && row.type === "job_work" ? (
										<TableRow>
											<TableCell />
											<TableCell colSpan={11}>
												<div className="flex flex-wrap items-end gap-4">
													<div className="space-y-1">
														<Label htmlFor={`jw-vendor-${row.id}`}>
															Job worker
														</Label>
														<Select
															value={
																pickState.vendorId
																	? String(pickState.vendorId)
																	: ""
															}
															onValueChange={(value) =>
																onChangePick(row.id, {
																	vendorId: Number(value),
																})
															}
														>
															<SelectTrigger
																id={`jw-vendor-${row.id}`}
																className="w-56"
															>
																<SelectValue placeholder="Pick a job worker" />
															</SelectTrigger>
															<SelectContent>
																{(row.jobWorker?.candidates ?? []).map((c) => (
																	<SelectItem
																		key={c.vendorId}
																		value={String(c.vendorId)}
																	>
																		{c.name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
													<div className="space-y-1">
														<Label htmlFor={`jw-return-${row.id}`}>
															Return date
														</Label>
														<Input
															id={`jw-return-${row.id}`}
															type="date"
															className="w-44"
															value={pickState.returnDate}
															onChange={(event) =>
																onChangePick(row.id, {
																	returnDate: event.target.value,
																})
															}
														/>
														{row.pastDue && pickState.returnDate === "" ? (
															<span className="text-[13px] text-destructive">
																Past due
															</span>
														) : null}
													</div>
													{row.sendQty !== null ? (
														<span className="pb-2 text-sm text-muted-foreground">
															Send {formatQty(row.sendQty, null, 0)}
														</span>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									) : null}
								</Fragment>
							);
						})}
			</TableBody>
		</Table>
	);
}
