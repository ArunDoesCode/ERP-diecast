"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Item</TableHead>
					<TableHead className="text-right">Qty</TableHead>
					<TableHead>Not quoted</TableHead>
					<TableHead className="text-right">Rate (₹ per unit)</TableHead>
					<TableHead className="text-right">GST %</TableHead>
					<TableHead className="text-right">Lead days</TableHead>
					<TableHead className="text-right">Freight (₹, line)</TableHead>
					<TableHead className="text-right">Value</TableHead>
					<TableHead className="text-right">Tax</TableHead>
					<TableHead className="text-right">Landed / unit</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => {
					const calc = calcRow(row);
					const error = showErrors ? rowError(row) : null;
					const id = `quote-${row.rfqItemId}`;
					return (
						<TableRow
							key={row.rfqItemId}
							className={row.notQuoted ? "text-muted-foreground" : undefined}
						>
							<TableCell>
								{row.itemCode} · {row.itemName}
								{error ? (
									<span
										role="alert"
										className="block text-[13px] text-destructive"
									>
										{error}
									</span>
								) : null}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(row.qty, row.uom, 3)}
							</TableCell>
							<TableCell>
								{readOnly ? (
									row.notQuoted ? (
										"Not quoted"
									) : (
										"–"
									)
								) : (
									<Checkbox
										id={`${id}-nq`}
										aria-label={`Not quoted: ${row.itemCode}`}
										checked={row.notQuoted}
										onCheckedChange={(on) =>
											onChange(row.rfqItemId, { notQuoted: on === true })
										}
									/>
								)}
							</TableCell>
							<TableCell className="text-right">
								{readOnly || row.notQuoted ? (
									<span className="tabular-nums">
										{row.notQuoted
											? "–"
											: formatMoney(Math.round(Number(row.rate || 0) * 100))}
									</span>
								) : (
									<Input
										id={`${id}-rate`}
										aria-label={`Rate for ${row.itemCode}`}
										inputMode="decimal"
										className="w-28 text-right tabular-nums"
										value={row.rate}
										aria-invalid={error ? true : undefined}
										onChange={(event) =>
											onChange(row.rfqItemId, { rate: event.target.value })
										}
									/>
								)}
							</TableCell>
							<TableCell className="text-right">
								{readOnly || row.notQuoted ? (
									<span className="tabular-nums">
										{row.notQuoted || row.gst === "" ? "–" : `${row.gst}%`}
									</span>
								) : (
									<Select
										value={row.gst}
										onValueChange={(value) =>
											onChange(row.rfqItemId, { gst: value })
										}
									>
										<SelectTrigger
											id={`${id}-gst`}
											aria-label={`GST % for ${row.itemCode}`}
											className="w-24"
										>
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
							</TableCell>
							<TableCell className="text-right">
								{readOnly || row.notQuoted ? (
									<span className="tabular-nums">
										{row.notQuoted || row.lead === "" ? "–" : row.lead}
									</span>
								) : (
									<Input
										id={`${id}-lead`}
										aria-label={`Lead days for ${row.itemCode}`}
										inputMode="numeric"
										className="w-20 text-right tabular-nums"
										value={row.lead}
										onChange={(event) =>
											onChange(row.rfqItemId, { lead: event.target.value })
										}
									/>
								)}
							</TableCell>
							<TableCell className="text-right">
								{readOnly || row.notQuoted ? (
									<span className="tabular-nums">
										{row.notQuoted || row.freight === ""
											? "–"
											: formatMoney(Math.round(Number(row.freight) * 100))}
									</span>
								) : (
									<Input
										id={`${id}-freight`}
										aria-label={`Freight for ${row.itemCode}`}
										inputMode="decimal"
										className="w-28 text-right tabular-nums"
										value={row.freight}
										onChange={(event) =>
											onChange(row.rfqItemId, { freight: event.target.value })
										}
									/>
								)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{calc ? formatMoney(calc.valuePaise) : "–"}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{calc ? formatMoney(calc.taxPaise) : "–"}
							</TableCell>
							<TableCell className="text-right font-semibold tabular-nums">
								{calc ? formatMoney(calc.landedPerUnitPaise) : "–"}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
