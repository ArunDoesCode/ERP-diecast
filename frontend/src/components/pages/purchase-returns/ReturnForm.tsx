"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import {
	computeImpact,
	type EditorRow,
	ReturnLinesEditor,
	rowCap,
	rowKey,
} from "@/components/pages/purchase-returns/ReturnLinesEditor";
import { qtyError } from "@/components/pages/purchase-returns/return-format";
import { PageHeader } from "@/components/shared/PageHeader";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/client";
import {
	prtErrorDetails,
	prtErrorMessage,
	useCreatePurchaseReturnMutation,
	useUpdatePurchaseReturnMutation,
} from "@/lib/api/purchase-return/queries";
import { formatMoney, formatQtyTrim } from "@/lib/format";
import {
	PRT_REASON_MAX,
	PRT_REASON_MIN,
	type PrtDetail,
	type PrtLineInput,
	type PrtPrefill,
} from "@/types/purchase-return";

function Field({
	id,
	label,
	hint,
	error,
	children,
	className,
}: {
	id: string;
	label: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={`min-h-19 space-y-1 ${className ?? ""}`}>
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

function initialRows(prefill: PrtPrefill, existing?: PrtDetail): EditorRow[] {
	if (existing) {
		return existing.lines.map((line) => ({
			key: rowKey(line.grnItemId, line.source),
			grnItemId: line.grnItemId,
			source: line.source,
			qty: String(line.qty),
		}));
	}
	return prefill.lines
		.filter((line) => line.suggested.length > 0 && line.rejectedReturnable > 0)
		.map((line) => ({
			key: rowKey(line.grnItemId, "rejected"),
			grnItemId: line.grnItemId,
			source: "rejected" as const,
			qty: String(line.suggested[0]?.qty ?? line.rejectedReturnable),
		}));
}

type Banner = { message: string; notEditable: boolean };

export function ReturnForm({
	prefill,
	existing,
}: {
	prefill: PrtPrefill;
	existing?: PrtDetail;
}) {
	const router = useRouter();
	const create = useCreatePurchaseReturnMutation();
	const update = useUpdatePurchaseReturnMutation();
	const isPending = create.isPending || update.isPending;

	const [reason, setReason] = useState(existing?.reason ?? "");
	const [rma, setRma] = useState(existing?.vendorReturnRef ?? "");
	const [transporter, setTransporter] = useState(existing?.transporter ?? "");
	const [vehicleNo, setVehicleNo] = useState(existing?.vehicleNo ?? "");
	const [remarks, setRemarks] = useState(existing?.remarks ?? "");
	const [replacement, setReplacement] = useState(
		existing?.replacementExpected ?? prefill.replacementExpected,
	);
	const [rows, setRows] = useState<EditorRow[]>(() =>
		initialRows(prefill, existing),
	);
	const [dirty, setDirty] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	const [leaveOpen, setLeaveOpen] = useState(false);

	const ownQty = useMemo(() => {
		const map: Record<string, number> = {};
		for (const line of existing?.lines ?? []) {
			map[rowKey(line.grnItemId, line.source)] = line.qty;
		}
		return map;
	}, [existing]);

	const impact = useMemo(
		() => computeImpact(prefill.lines, rows),
		[prefill.lines, rows],
	);

	const trimmedReason = reason.trim();
	const reasonError =
		trimmedReason.length < PRT_REASON_MIN
			? `Reason needs at least ${PRT_REASON_MIN} characters`
			: trimmedReason.length > PRT_REASON_MAX
				? `Reason can be up to ${PRT_REASON_MAX} characters`
				: null;

	const byId = new Map(prefill.lines.map((line) => [line.grnItemId, line]));
	const linesInvalid =
		rows.length === 0 ||
		rows.some((row) => {
			const line = byId.get(row.grnItemId);
			return (
				!line ||
				qtyError(
					row.qty,
					line.uom,
					rowCap(line, row.source, ownQty[row.key] ?? 0),
				) !== null
			);
		});

	const detailHref = existing ? `/purchase-returns/${existing.id}` : null;
	const cancelHref = detailHref ?? "/purchase-returns?tab=awaiting";

	function touch<T>(setter: (value: T) => void) {
		return (value: T) => {
			setter(value);
			setDirty(true);
			setServerErrors({});
		};
	}

	function onSubmit(event?: FormEvent) {
		event?.preventDefault();
		setShowErrors(true);
		setBanner(null);
		setServerErrors({});
		if (reasonError || linesInvalid) return;

		const lines: PrtLineInput[] = rows.map((row) => ({
			grnItemId: row.grnItemId,
			source: row.source,
			qty: Number(row.qty),
		}));
		const onError = (error: unknown) => {
			if (
				error instanceof ApiClientError &&
				error.code === "PRT_CAP_EXCEEDED"
			) {
				const details = prtErrorDetails(error);
				if (details?.grnItemId !== undefined && details.source) {
					const key = `${details.grnItemId}:${details.source}`;
					setServerErrors({ [key]: prtErrorMessage(error, "Too much") });
					return;
				}
			}
			setBanner({
				message: prtErrorMessage(error, "Could not save the return."),
				notEditable:
					error instanceof ApiClientError && error.code === "PRT_NOT_EDITABLE",
			});
		};

		if (existing) {
			update.mutate(
				{
					id: existing.id,
					reason: trimmedReason,
					vendorReturnRef: rma.trim(),
					transporter: transporter.trim(),
					vehicleNo: vehicleNo.trim(),
					remarks: remarks.trim(),
					replacementExpected: replacement,
					lines,
				},
				{
					onSuccess: (result) => {
						setDirty(false);
						router.push(`/purchase-returns/${result.data.id}`);
					},
					onError,
				},
			);
			return;
		}
		create.mutate(
			{
				grnId: prefill.grnId,
				reason: trimmedReason,
				vendorReturnRef: rma.trim() || undefined,
				transporter: transporter.trim() || undefined,
				vehicleNo: vehicleNo.trim() || undefined,
				remarks: remarks.trim() || undefined,
				replacementExpected: replacement,
				lines,
			},
			{
				onSuccess: (result) => {
					setDirty(false);
					router.push(`/purchase-returns/${result.data.id}`);
				},
				onError,
			},
		);
	}

	function onCancel() {
		if (dirty) setLeaveOpen(true);
		else router.push(cancelHref);
	}

	const impactParts: string[] = [];
	if (impact.stock.length > 0) {
		impactParts.push(
			`Stock ${impact.stock
				.map((s) => `−${formatQtyTrim(s.qty, s.uom)} ${s.itemName}`)
				.join(", ")}`,
		);
	} else if (impact.hasRejected) {
		impactParts.push("No stock movement");
	}
	impactParts.push(`Debit note ${formatMoney(impact.totalPaise)}`);
	impactParts.push(
		replacement ? "PO reopens for a replacement" : "PO unchanged",
	);

	return (
		<form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
			<PageHeader
				title={existing ? `Edit ${existing.proNumber}` : "New purchase return"}
			/>

			{banner ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					<span>
						{banner.notEditable
							? "This return is already posted."
							: banner.message}
					</span>
					{banner.notEditable && detailHref ? (
						<Link href={detailHref} className="font-medium underline">
							Open the return
						</Link>
					) : null}
				</div>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Return details</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-x-4 gap-y-2 md:grid-cols-3">
					<Field id="prt-grn" label="GRN">
						<p id="prt-grn" className="flex h-9 items-center text-sm">
							<Link
								href={`/grn/${prefill.grnId}`}
								className="font-mono text-brand-accent hover:underline"
							>
								{prefill.grnNumber}
							</Link>
						</p>
					</Field>
					<Field id="prt-supplier" label="Supplier">
						<p id="prt-supplier" className="flex h-9 items-center text-sm">
							{prefill.supplierName}
						</p>
					</Field>
					<Field id="prt-po" label="PO">
						<p id="prt-po" className="flex h-9 items-center font-mono text-sm">
							{prefill.poNumber}
						</p>
					</Field>
					<Field
						id="prt-reason"
						label="Reason *"
						error={showErrors ? reasonError : null}
						className="md:col-span-3"
					>
						<Textarea
							id="prt-reason"
							value={reason}
							maxLength={PRT_REASON_MAX}
							disabled={isPending}
							onChange={(event) => touch(setReason)(event.target.value)}
						/>
					</Field>
					<Field id="prt-rma" label="Vendor return / RMA ref">
						<Input
							id="prt-rma"
							value={rma}
							maxLength={100}
							disabled={isPending}
							onChange={(event) => touch(setRma)(event.target.value)}
						/>
					</Field>
					<Field id="prt-transporter" label="Transporter">
						<Input
							id="prt-transporter"
							value={transporter}
							maxLength={100}
							disabled={isPending}
							onChange={(event) => touch(setTransporter)(event.target.value)}
						/>
					</Field>
					<Field id="prt-vehicle" label="Vehicle no.">
						<Input
							id="prt-vehicle"
							value={vehicleNo}
							maxLength={20}
							disabled={isPending}
							onChange={(event) => touch(setVehicleNo)(event.target.value)}
						/>
					</Field>
					<Field id="prt-remarks" label="Remarks" className="md:col-span-3">
						<Input
							id="prt-remarks"
							value={remarks}
							maxLength={500}
							disabled={isPending}
							onChange={(event) => touch(setRemarks)(event.target.value)}
						/>
					</Field>
					<div className="space-y-1 md:col-span-3">
						<div className="flex items-center gap-2">
							<Checkbox
								id="prt-replacement"
								checked={replacement}
								disabled={isPending}
								onCheckedChange={(checked) =>
									touch(setReplacement)(checked === true)
								}
							/>
							<Label htmlFor="prt-replacement">Replacement expected</Label>
						</div>
						<p className="text-[13px] text-muted-foreground">
							PO reopens for a replacement GRN.
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent>
					<ReturnLinesEditor
						lines={prefill.lines}
						rows={rows}
						ownQty={ownQty}
						serverErrors={serverErrors}
						showErrors={showErrors}
						disabled={isPending}
						onQtyChange={(key, qty) => {
							setRows((current) =>
								current.map((row) => (row.key === key ? { ...row, qty } : row)),
							);
							setDirty(true);
							setServerErrors({});
						}}
						onRemove={(key) => {
							setRows((current) => current.filter((row) => row.key !== key));
							setDirty(true);
						}}
						onAdd={(grnItemId, source) => {
							setRows((current) => [
								...current,
								{ key: rowKey(grnItemId, source), grnItemId, source, qty: "" },
							]);
							setDirty(true);
						}}
					/>
					{showErrors && rows.length === 0 ? (
						<p className="mt-2 text-[13px] text-destructive">
							Add at least one line to return.
						</p>
					) : null}
				</CardContent>
			</Card>

			<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
				{impactParts.join(" · ")}
			</output>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={isPending}
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={isPending}>
					{isPending ? "Saving…" : "Save draft"}
				</Button>
			</div>

			<AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Leave without saving?</AlertDialogTitle>
						<AlertDialogDescription>
							Your changes on this return are not saved yet.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction onClick={() => router.push(cancelHref)}>
							Leave
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</form>
	);
}
