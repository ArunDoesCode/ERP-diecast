"use client";

import { IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";

import { positiveDecimalError } from "@/components/pages/delivery-notes/dn-format";
import { Button } from "@/components/ui/button";
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
import { formatQty } from "@/lib/format";
import {
	DN_LOT_MAX,
	DN_MAX_PACKAGES,
	dnQtyDecimals,
} from "@/types/delivery-note";

export type DnPackageRow = {
	key: string;
	packageNo: string;
	soLineId: number | null;
	qty: string;
	netKg: string;
	grossKg: string;
	lot: string;
};

export type PackLine = {
	soLineId: number;
	sku: string;
	uom: string;
	/** Note qty typed for the line, 0 when not valid yet. */
	qty: number;
	lot: string;
};

type Props = {
	rows: DnPackageRow[];
	lines: PackLine[];
	wide: boolean;
	showErrors: boolean;
	disabled: boolean;
	/** Server errors by row key. */
	serverErrors: Record<string, string>;
	onChange: (key: string, patch: Partial<DnPackageRow>) => void;
	onRemove: (key: string) => void;
	onAdd: () => void;
	onDuplicate: () => void;
};

function rowErrors(
	row: DnPackageRow,
	rows: DnPackageRow[],
	lines: PackLine[],
	showErrors: boolean,
) {
	const errors: Record<string, string | null> = {};
	const touched = (value: string) => showErrors || value.trim() !== "";
	const no = row.packageNo.trim();
	errors.packageNo =
		no === ""
			? showErrors
				? "Required"
				: null
			: no.length > 20
				? "At most 20 characters"
				: rows.filter((other) => other.packageNo.trim() === no).length > 1
					? "Used twice"
					: null;
	errors.line =
		row.soLineId === null
			? showErrors
				? "Pick a line"
				: null
			: lines.some((line) => line.soLineId === row.soLineId)
				? null
				: "Line is not on the note";
	errors.qty = touched(row.qty) ? positiveDecimalError(row.qty) : null;
	const line = lines.find((entry) => entry.soLineId === row.soLineId);
	if (
		!errors.qty &&
		line &&
		dnQtyDecimals(line.uom) === 0 &&
		!Number.isInteger(Number(row.qty))
	) {
		errors.qty = `${line.uom} must be whole`;
	}
	errors.netKg = touched(row.netKg) ? positiveDecimalError(row.netKg) : null;
	errors.grossKg = touched(row.grossKg)
		? positiveDecimalError(row.grossKg)
		: null;
	if (
		!errors.netKg &&
		!errors.grossKg &&
		Number(row.grossKg) < Number(row.netKg)
	) {
		errors.grossKg = "Gross is below net";
	}
	return errors;
}

/** True when any package row is wrong; the form blocks Save on it. */
export function packagesInvalid(rows: DnPackageRow[], lines: PackLine[]) {
	return rows.some((row) =>
		Object.values(rowErrors(row, rows, lines, true)).some(Boolean),
	);
}

function Totals({ rows }: { rows: DnPackageRow[] }) {
	const net = rows.reduce((sum, row) => sum + (Number(row.netKg) || 0), 0);
	const gross = rows.reduce((sum, row) => sum + (Number(row.grossKg) || 0), 0);
	return (
		<span className="text-[13px] text-muted-foreground tabular-nums">
			Net {formatQty(net, "kg", 3)} · Gross {formatQty(gross, "kg", 3)}
		</span>
	);
}

/** "Packed 550 of 600 pcs" per line: muted without boxes, success when equal, warning when different. */
export function PackedSummary({
	rows,
	lines,
}: {
	rows: DnPackageRow[];
	lines: PackLine[];
}) {
	return (
		<ul className="flex flex-col gap-0.5 text-[13px]">
			{lines.map((line) => {
				const packed = rows
					.filter((row) => row.soLineId === line.soLineId)
					.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
				const hasBoxes = rows.some((row) => row.soLineId === line.soLineId);
				const equal = Math.abs(packed - line.qty) < 1e-9;
				const dec = dnQtyDecimals(line.uom);
				return (
					<li
						key={line.soLineId}
						className={
							!hasBoxes
								? "text-muted-foreground"
								: equal
									? "text-success"
									: "text-warning"
						}
					>
						{line.sku}: Packed {formatQty(packed, null, dec)} of{" "}
						{formatQty(line.qty, line.uom, dec)}
						{hasBoxes && !equal
							? `. Must equal ${formatQty(line.qty, null, dec)} before posting`
							: ""}
					</li>
				);
			})}
		</ul>
	);
}

export function DnPackagesEditor(props: Props) {
	const { rows, lines, wide, disabled } = props;
	const atMax = rows.length >= DN_MAX_PACKAGES;
	const lineSelect = (row: DnPackageRow, id: string, ariaLabel: string) => (
		<Select
			value={row.soLineId === null ? undefined : String(row.soLineId)}
			disabled={disabled}
			onValueChange={(value) => {
				const line = lines.find((entry) => entry.soLineId === Number(value));
				props.onChange(row.key, {
					soLineId: Number(value),
					lot: row.lot || (line?.lot ?? ""),
				});
			}}
		>
			<SelectTrigger
				id={id}
				aria-label={ariaLabel}
				className="h-10 w-full min-w-32"
			>
				<SelectValue placeholder="Line" />
			</SelectTrigger>
			<SelectContent>
				{lines.map((line) => (
					<SelectItem key={line.soLineId} value={String(line.soLineId)}>
						{line.sku}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	const toolbar = (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={disabled || atMax || lines.length === 0}
				onClick={props.onAdd}
			>
				<IconPlus />
				Add package
			</Button>
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={disabled || atMax || rows.length === 0}
				onClick={props.onDuplicate}
			>
				<IconCopy />
				Duplicate last row
			</Button>
			{rows.length > 0 ? <Totals rows={rows} /> : null}
		</div>
	);

	if (rows.length === 0) {
		return (
			<div className="flex flex-col gap-3">
				{toolbar}
				<p className="text-sm text-muted-foreground">
					No packages. A packing list is optional.
				</p>
				<PackedSummary rows={rows} lines={lines} />
			</div>
		);
	}

	if (!wide) {
		return (
			<div className="flex flex-col gap-3">
				{toolbar}
				<ul className="flex flex-col gap-3">
					{rows.map((row, index) => {
						const e = rowErrors(row, rows, lines, props.showErrors);
						const base = `dn-pkg-${row.key}`;
						return (
							<li
								key={row.key}
								className="flex flex-col gap-2 rounded-md border p-3"
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">
										Package {index + 1}
									</span>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Remove package ${row.packageNo || index + 1}`}
										disabled={disabled}
										onClick={() => props.onRemove(row.key)}
									>
										<IconTrash />
									</Button>
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									<Cell
										id={`${base}-no`}
										label="Package no. *"
										error={e.packageNo}
									>
										<Input
											id={`${base}-no`}
											className="h-10"
											value={row.packageNo}
											maxLength={20}
											disabled={disabled}
											onChange={(event) =>
												props.onChange(row.key, {
													packageNo: event.target.value,
												})
											}
										/>
									</Cell>
									<Cell id={`${base}-line`} label="Line *" error={e.line}>
										{lineSelect(row, `${base}-line`, "Line")}
									</Cell>
									<Cell id={`${base}-qty`} label="Qty *" error={e.qty}>
										<Input
											id={`${base}-qty`}
											className="h-10 text-right tabular-nums"
											inputMode="decimal"
											value={row.qty}
											disabled={disabled}
											onChange={(event) =>
												props.onChange(row.key, { qty: event.target.value })
											}
										/>
									</Cell>
									<Cell id={`${base}-net`} label="Net kg *" error={e.netKg}>
										<Input
											id={`${base}-net`}
											className="h-10 text-right tabular-nums"
											inputMode="decimal"
											value={row.netKg}
											disabled={disabled}
											onChange={(event) =>
												props.onChange(row.key, { netKg: event.target.value })
											}
										/>
									</Cell>
									<Cell
										id={`${base}-gross`}
										label="Gross kg *"
										error={e.grossKg}
									>
										<Input
											id={`${base}-gross`}
											className="h-10 text-right tabular-nums"
											inputMode="decimal"
											value={row.grossKg}
											disabled={disabled}
											onChange={(event) =>
												props.onChange(row.key, { grossKg: event.target.value })
											}
										/>
									</Cell>
									<Cell id={`${base}-lot`} label="Lot / heat no.">
										<Input
											id={`${base}-lot`}
											className="h-10"
											value={row.lot}
											maxLength={DN_LOT_MAX}
											disabled={disabled}
											onChange={(event) =>
												props.onChange(row.key, { lot: event.target.value })
											}
										/>
									</Cell>
								</div>
								{props.serverErrors[row.key] ? (
									<p className="text-[13px] text-destructive">
										{props.serverErrors[row.key]}
									</p>
								) : null}
							</li>
						);
					})}
				</ul>
				<PackedSummary rows={rows} lines={lines} />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{toolbar}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Package no. *</TableHead>
						<TableHead>Line *</TableHead>
						<TableHead className="text-right">Qty *</TableHead>
						<TableHead className="text-right">Net kg *</TableHead>
						<TableHead className="text-right">Gross kg *</TableHead>
						<TableHead>Lot / heat no.</TableHead>
						<TableHead className="w-10">
							<span className="sr-only">Remove</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, index) => {
						const e = rowErrors(row, rows, lines, props.showErrors);
						const label = `package ${row.packageNo || index + 1}`;
						return (
							<TableRow key={row.key} className="align-top">
								<TableCell>
									<Input
										aria-label={`Package no. ${index + 1}`}
										className="h-10 w-28"
										value={row.packageNo}
										maxLength={20}
										disabled={disabled}
										aria-invalid={e.packageNo ? true : undefined}
										onChange={(event) =>
											props.onChange(row.key, { packageNo: event.target.value })
										}
									/>
									<ErrorLine message={e.packageNo} />
								</TableCell>
								<TableCell>
									{lineSelect(
										row,
										`dn-pkg-${row.key}-line`,
										`Line of ${label}`,
									)}
									<ErrorLine message={e.line} />
								</TableCell>
								<TableCell>
									<Input
										aria-label={`Qty of ${label}`}
										className="h-10 w-24 text-right tabular-nums"
										inputMode="decimal"
										value={row.qty}
										disabled={disabled}
										aria-invalid={e.qty ? true : undefined}
										onChange={(event) =>
											props.onChange(row.key, { qty: event.target.value })
										}
									/>
									<ErrorLine message={e.qty} />
								</TableCell>
								<TableCell>
									<Input
										aria-label={`Net kg of ${label}`}
										className="h-10 w-24 text-right tabular-nums"
										inputMode="decimal"
										value={row.netKg}
										disabled={disabled}
										aria-invalid={e.netKg ? true : undefined}
										onChange={(event) =>
											props.onChange(row.key, { netKg: event.target.value })
										}
									/>
									<ErrorLine message={e.netKg} />
								</TableCell>
								<TableCell>
									<Input
										aria-label={`Gross kg of ${label}`}
										className="h-10 w-24 text-right tabular-nums"
										inputMode="decimal"
										value={row.grossKg}
										disabled={disabled}
										aria-invalid={e.grossKg ? true : undefined}
										onChange={(event) =>
											props.onChange(row.key, { grossKg: event.target.value })
										}
									/>
									<ErrorLine message={e.grossKg} />
								</TableCell>
								<TableCell>
									<Input
										aria-label={`Lot of ${label}`}
										className="h-10 w-32"
										value={row.lot}
										maxLength={DN_LOT_MAX}
										disabled={disabled}
										onChange={(event) =>
											props.onChange(row.key, { lot: event.target.value })
										}
									/>
									<ErrorLine message={props.serverErrors[row.key] ?? null} />
								</TableCell>
								<TableCell>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Remove ${label}`}
										disabled={disabled}
										onClick={() => props.onRemove(row.key)}
									>
										<IconTrash />
									</Button>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell colSpan={7}>
							<PackedSummary rows={rows} lines={lines} />
						</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	);
}

function ErrorLine({ message }: { message: string | null | undefined }) {
	return message ? (
		<p className="mt-1 text-[13px] text-destructive">{message}</p>
	) : null;
}

function Cell({
	id,
	label,
	error,
	children,
}: {
	id: string;
	label: string;
	error?: string | null;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<Label htmlFor={id}>{label}</Label>
			{children}
			<ErrorLine message={error} />
		</div>
	);
}
