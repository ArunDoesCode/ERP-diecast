"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";

import {
	previewLineTotalPaise,
	qtyError,
} from "@/components/pages/purchase-returns/return-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatMoney, formatQty } from "@/lib/format";
import type { PrtPrefillLine, PrtSource } from "@/types/purchase-return";

export type EditorRow = {
	key: string;
	grnItemId: number;
	source: PrtSource;
	qty: string;
};

export const rowKey = (grnItemId: number, source: PrtSource) =>
	`${grnItemId}:${source}`;

const SOURCE_LABEL: Record<PrtSource, string> = {
	rejected: "Rejected",
	accepted: "Accepted",
};

/** Open to return for a row: what the GRN line can still give, plus this draft's own qty on edit. */
export function rowCap(
	line: PrtPrefillLine,
	source: PrtSource,
	ownQty: number,
) {
	const open =
		source === "rejected" ? line.rejectedReturnable : line.acceptedReturnable;
	return Math.round((open + ownQty) * 1000) / 1000;
}

export function ReturnLinesEditor({
	lines,
	rows,
	ownQty,
	serverErrors,
	showErrors,
	disabled,
	onQtyChange,
	onRemove,
	onAdd,
}: {
	lines: PrtPrefillLine[];
	rows: EditorRow[];
	/** Qty each row had when the draft was loaded (0 on a new return). */
	ownQty: Record<string, number>;
	/** Server cap errors by row key. */
	serverErrors: Record<string, string>;
	showErrors: boolean;
	disabled: boolean;
	onQtyChange: (key: string, qty: string) => void;
	onRemove: (key: string) => void;
	onAdd: (grnItemId: number, source: PrtSource) => void;
}) {
	const byId = new Map(lines.map((line) => [line.grnItemId, line]));
	const additions: { line: PrtPrefillLine; source: PrtSource }[] = [];
	for (const line of lines) {
		for (const source of ["rejected", "accepted"] as const) {
			const present = rows.some(
				(row) => row.grnItemId === line.grnItemId && row.source === source,
			);
			if (!present && rowCap(line, source, 0) > 0) {
				additions.push({ line, source });
			}
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Item</TableHead>
						<TableHead>Heat no.</TableHead>
						<TableHead>Unit</TableHead>
						<TableHead>Source</TableHead>
						<TableHead className="text-right">Rate</TableHead>
						<TableHead className="text-right">GST %</TableHead>
						<TableHead className="text-right">Open to return</TableHead>
						<TableHead className="text-right">Qty</TableHead>
						<TableHead className="w-10">
							<span className="sr-only">Remove</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => {
						const line = byId.get(row.grnItemId);
						if (!line) return null;
						const cap = rowCap(line, row.source, ownQty[row.key] ?? 0);
						const error =
							serverErrors[row.key] ??
							(showErrors || row.qty.trim() !== ""
								? qtyError(row.qty, line.uom, cap)
								: null);
						const inputId = `prt-qty-${row.key.replace(":", "-")}`;
						return (
							<TableRow key={row.key}>
								<TableCell className="whitespace-normal">
									{line.itemName}
								</TableCell>
								<TableCell>{line.batchNumber ?? "–"}</TableCell>
								<TableCell>{line.uom}</TableCell>
								<TableCell>{SOURCE_LABEL[row.source]}</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatMoney(line.ratePaise)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{line.gstPercent}%
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatQty(cap, line.uom, 3)}
								</TableCell>
								<TableCell className="min-w-32 text-right">
									<label htmlFor={inputId} className="sr-only">
										Qty to return for {line.itemName} (
										{SOURCE_LABEL[row.source]})
									</label>
									<Input
										id={inputId}
										inputMode="decimal"
										value={row.qty}
										disabled={disabled}
										aria-invalid={error ? true : undefined}
										aria-describedby={error ? `${inputId}-error` : undefined}
										className="ml-auto w-28 text-right tabular-nums"
										onChange={(event) =>
											onQtyChange(row.key, event.target.value)
										}
									/>
									{error ? (
										<p
											id={`${inputId}-error`}
											className="mt-1 text-[13px] whitespace-normal text-destructive"
										>
											{error}
										</p>
									) : null}
								</TableCell>
								<TableCell>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Remove ${line.itemName} (${SOURCE_LABEL[row.source]})`}
										disabled={disabled || rows.length <= 1}
										onClick={() => onRemove(row.key)}
									>
										<IconTrash />
									</Button>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
			{additions.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{additions.map(({ line, source }) => (
						<Button
							key={rowKey(line.grnItemId, source)}
							type="button"
							size="sm"
							variant="outline"
							disabled={disabled}
							onClick={() => onAdd(line.grnItemId, source)}
						>
							<IconPlus />
							Add {source} qty · {line.itemName}
							{line.batchNumber ? ` · ${line.batchNumber}` : ""}
						</Button>
					))}
				</div>
			) : null}
		</div>
	);
}

/** Live impact line from the typed quantities (BR-PRT-40). Returns pieces for the strip. */
export function computeImpact(
	lines: PrtPrefillLine[],
	rows: EditorRow[],
): {
	stock: { itemName: string; qty: number; uom: string }[];
	hasRejected: boolean;
	totalPaise: number;
} {
	const byId = new Map(lines.map((line) => [line.grnItemId, line]));
	const stock = new Map<
		number,
		{ itemName: string; qty: number; uom: string }
	>();
	let hasRejected = false;
	let totalPaise = 0;
	for (const row of rows) {
		const line = byId.get(row.grnItemId);
		const qty = Number(row.qty);
		if (!line || !Number.isFinite(qty) || qty <= 0) continue;
		totalPaise += previewLineTotalPaise(qty, line.ratePaise, line.gstPercent);
		if (row.source === "rejected") {
			hasRejected = true;
			continue;
		}
		const entry = stock.get(line.itemId) ?? {
			itemName: line.itemName,
			qty: 0,
			uom: line.uom,
		};
		entry.qty = Math.round((entry.qty + qty) * 1000) / 1000;
		stock.set(line.itemId, entry);
	}
	return { stock: [...stock.values()], hasRejected, totalPaise };
}
