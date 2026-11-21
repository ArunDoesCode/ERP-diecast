"use client";

import type { ReactNode } from "react";

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
import { formatMoney, formatQty } from "@/lib/format";
import { RFQ_GST_PERCENTS } from "@/types/rfq";

import { calcRow, type QuoteRow, rowError } from "./quote-calc";

/** Quote lines: inputs while editing a draft, plain text for a submitted quote. */
export function QuoteLinesTable({
	rows,
	readOnly,
	showErrors,
	onChange,
}: {
	rows: QuoteRow[];
	readOnly: boolean;
	showErrors: boolean;
	onChange: (rfqItemId: number, patch: Partial<QuoteRow>) => void;
}) {
	return (
		<ul className="flex flex-col gap-3">
			{rows.map((row) => {
				const calc = calcRow(row);
				const error = showErrors ? rowError(row) : null;
				const id = `quote-${row.rfqItemId}`;
				const hidden = readOnly || row.notQuoted;
				return (
					<li
						key={row.rfqItemId}
						className="rounded-md border border-border p-3"
					>
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div
								className={row.notQuoted ? "text-muted-foreground" : undefined}
							>
								<p className="font-medium">
									{row.itemCode} · {row.itemName}
								</p>
								<p className="text-[13px] text-muted-foreground tabular-nums">
									Qty {formatQty(row.qty, row.uom, 3)}
								</p>
								{error ? (
									<span
										role="alert"
										className="block text-[13px] text-destructive"
									>
										{error}
									</span>
								) : null}
							</div>
							{readOnly ? (
								row.notQuoted ? (
									<span className="text-sm text-muted-foreground">
										Not quoted
									</span>
								) : null
							) : (
								<div className="flex items-center gap-2">
									<Checkbox
										id={`${id}-nq`}
										className="rounded-[4px]"
										checked={row.notQuoted}
										onCheckedChange={(on) =>
											onChange(row.rfqItemId, { notQuoted: on === true })
										}
									/>
									<Label htmlFor={`${id}-nq`}>Not quoted</Label>
								</div>
							)}
						</div>
						{row.notQuoted ? null : (
							<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4 xl:grid-cols-7">
								<Field label="Rate (₹ per unit)" htmlFor={`${id}-rate`}>
									{hidden ? (
										<Text>
											{formatMoney(Math.round(Number(row.rate || 0) * 100))}
										</Text>
									) : (
										<Input
											id={`${id}-rate`}
											inputMode="decimal"
											className="text-right tabular-nums"
											value={row.rate}
											aria-invalid={error ? true : undefined}
											onChange={(event) =>
												onChange(row.rfqItemId, { rate: event.target.value })
											}
										/>
									)}
								</Field>
								<Field label="GST %" htmlFor={`${id}-gst`}>
									{hidden ? (
										<Text>{row.gst === "" ? "–" : `${row.gst}%`}</Text>
									) : (
										<Select
											value={row.gst}
											onValueChange={(value) =>
												onChange(row.rfqItemId, { gst: value })
											}
										>
											<SelectTrigger id={`${id}-gst`} className="w-full">
												<SelectValue placeholder="GST %" />
											</SelectTrigger>
											<SelectContent>
												{RFQ_GST_PERCENTS.map((value) => (
													<SelectItem key={value} value={String(value)}>
														{value}%
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								</Field>
								<Field label="Lead days" htmlFor={`${id}-lead`}>
									{hidden ? (
										<Text>{row.lead === "" ? "–" : row.lead}</Text>
									) : (
										<Input
											id={`${id}-lead`}
											inputMode="numeric"
											className="text-right tabular-nums"
											value={row.lead}
											onChange={(event) =>
												onChange(row.rfqItemId, { lead: event.target.value })
											}
										/>
									)}
								</Field>
								<Field label="Freight (₹, line)" htmlFor={`${id}-freight`}>
									{hidden ? (
										<Text>
											{row.freight === ""
												? "–"
												: formatMoney(Math.round(Number(row.freight) * 100))}
										</Text>
									) : (
										<Input
											id={`${id}-freight`}
											inputMode="decimal"
											className="text-right tabular-nums"
											value={row.freight}
											onChange={(event) =>
												onChange(row.rfqItemId, { freight: event.target.value })
											}
										/>
									)}
								</Field>
								<Field label="Value">
									<Text>{calc ? formatMoney(calc.valuePaise) : "–"}</Text>
								</Field>
								<Field label="Tax">
									<Text>{calc ? formatMoney(calc.taxPaise) : "–"}</Text>
								</Field>
								<Field label="Landed / unit">
									<Text strong>
										{calc ? formatMoney(calc.landedPerUnitPaise) : "–"}
									</Text>
								</Field>
							</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}

function Field({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			{htmlFor ? (
				<Label htmlFor={htmlFor} className="text-[13px]">
					{label}
				</Label>
			) : (
				<span className="text-[13px] font-medium text-muted-foreground">
					{label}
				</span>
			)}
			{children}
		</div>
	);
}

function Text({ children, strong }: { children: ReactNode; strong?: boolean }) {
	return (
		<span
			className={`flex min-h-9 items-center justify-end tabular-nums ${strong ? "font-semibold" : ""}`}
		>
			{children}
		</span>
	);
}
