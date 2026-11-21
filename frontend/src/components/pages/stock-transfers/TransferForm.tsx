"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	type FormEvent,
	type ReactNode,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	type BalanceLookup,
	TransferLinesEditor,
	type TransferRow,
} from "@/components/pages/stock-transfers/TransferLinesEditor";
import { transferQtyError } from "@/components/pages/stock-transfers/transfer-format";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStockQuery } from "@/lib/api/asset/queries";
import { ApiClientError } from "@/lib/api/client";
import {
	stErrorMessage,
	useCreateStockTransferMutation,
	useUpdateStockTransferMutation,
} from "@/lib/api/stock-transfer/queries";
import {
	ST_NOTE_MAX,
	type StDetail,
	type StLineInput,
} from "@/types/stock-transfer";

export type TransferLocationOption = { id: number; name: string };

export type TransferPrefill = {
	sourceId?: number;
	item?: { id: number; label: string; unit: string };
};

function Field({
	id,
	label,
	error,
	children,
	className,
}: {
	id: string;
	label: string;
	error?: string | null;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={`min-h-19 space-y-1 ${className ?? ""}`}>
			<Label htmlFor={id}>{label}</Label>
			{children}
			{error ? <p className="text-[13px] text-destructive">{error}</p> : null}
		</div>
	);
}

const NO_LINE_ERRORS: Record<string, string> = {};

type Banner = { message: string; notDraft: boolean };

export function TransferForm({
	locations,
	existing,
	prefill,
}: {
	locations: TransferLocationOption[];
	existing?: StDetail;
	prefill?: TransferPrefill;
}) {
	const router = useRouter();
	const create = useCreateStockTransferMutation();
	const update = useUpdateStockTransferMutation(existing?.id ?? 0);
	const isPending = create.isPending || update.isPending;

	const counter = useRef(0);
	const nextKey = () => {
		counter.current += 1;
		return `r${counter.current}`;
	};

	const [sourceId, setSourceId] = useState<string>(
		existing
			? String(existing.source.id)
			: prefill?.sourceId
				? String(prefill.sourceId)
				: "",
	);
	const [destId, setDestId] = useState<string>(
		existing ? String(existing.destination.id) : "",
	);
	const [notes, setNotes] = useState(existing?.notes ?? "");
	const [rows, setRows] = useState<TransferRow[]>(() => {
		if (existing) {
			return existing.lines.map((line) => ({
				key: nextKey(),
				itemId: line.itemId,
				label: `${line.sku} · ${line.name}`,
				unit: line.unit,
				qty: String(line.qty),
			}));
		}
		if (prefill?.item) {
			return [
				{
					key: nextKey(),
					itemId: prefill.item.id,
					label: prefill.item.label,
					unit: prefill.item.unit,
					qty: "",
				},
			];
		}
		return [{ key: nextKey(), itemId: null, label: "", unit: null, qty: "" }];
	});
	const [dirty, setDirty] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [fieldErrors, setFieldErrors] = useState<{
		from?: string;
		to?: string;
	}>({});
	const [leaveOpen, setLeaveOpen] = useState(false);

	const source = locations.find((l) => String(l.id) === sourceId) ?? null;
	const destOptions = locations.filter((l) => String(l.id) !== sourceId);

	// Available at source: live from the stock view of the chosen source.
	const stock = useStockQuery(
		source ? { page: 1, pageSize: 100, locationId: source.id } : undefined,
		source !== null,
	);
	const stockData = stock.data;
	const balanceOf = useMemo<BalanceLookup>(
		() => (row) => {
			if (!source || row.itemId === null) return null;
			// An untouched draft line carries its own live balance.
			if (existing && source.id === existing.source.id) {
				const own = existing.lines.find((l) => l.itemId === row.itemId);
				if (own?.sourceBalanceQty != null) return own.sourceBalanceQty;
			}
			if (!stockData) return null;
			const found = stockData.data.find((s) => s.itemId === row.itemId);
			if (found) {
				return (
					found.locations.find((l) => l.locationId === source.id)?.balance ?? 0
				);
			}
			// Not in the first 100 stock rows: only "0" when the list is complete.
			return stockData.meta.total <= stockData.data.length ? 0 : null;
		},
		[source, existing, stockData],
	);

	const sourceError = showErrors && !sourceId ? "Choose the source" : null;
	const destError = showErrors && !destId ? "Choose the destination" : null;
	const rowsInvalid = rows.some(
		(row) =>
			row.itemId === null || transferQtyError(row.qty, row.unit) !== null,
	);

	const detailHref = existing
		? `/inventory/stock-transfers/${existing.id}`
		: null;
	const cancelHref = detailHref ?? "/inventory/stock-transfers";

	function touch() {
		setDirty(true);
		setBanner(null);
		setFieldErrors({});
	}

	function onSubmit(event?: FormEvent) {
		event?.preventDefault();
		setShowErrors(true);
		setBanner(null);
		setFieldErrors({});
		if (!sourceId || !destId || rowsInvalid) return;

		const lines: StLineInput[] = rows.map((row) => ({
			itemId: row.itemId as number,
			qty: Number(row.qty),
		}));
		const trimmedNotes = notes.trim();
		const onError = (error: unknown) => {
			if (error instanceof ApiClientError) {
				if (error.code === "STR_SAME_LOCATION") {
					setFieldErrors({ to: error.message });
					return;
				}
				if (error.code === "STR_VENDOR_LOCATION") {
					setFieldErrors({ from: error.message });
					return;
				}
			}
			setBanner({
				message: stErrorMessage(error, "Could not save the transfer."),
				notDraft:
					error instanceof ApiClientError && error.code === "STR_NOT_DRAFT",
			});
		};

		if (existing) {
			update.mutate(
				{
					sourceLocationId: Number(sourceId),
					destinationLocationId: Number(destId),
					notes: trimmedNotes ? trimmedNotes : null,
					lines,
				},
				{
					onSuccess: (result) => {
						setDirty(false);
						router.push(`/inventory/stock-transfers/${result.data.id}`);
					},
					onError,
				},
			);
			return;
		}
		create.mutate(
			{
				sourceLocationId: Number(sourceId),
				destinationLocationId: Number(destId),
				notes: trimmedNotes ? trimmedNotes : undefined,
				lines,
			},
			{
				onSuccess: (result) => {
					setDirty(false);
					router.push(`/inventory/stock-transfers/${result.data.id}`);
				},
				onError,
			},
		);
	}

	function onCancel() {
		if (dirty) setLeaveOpen(true);
		else router.push(cancelHref);
	}

	return (
		<form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
			<PageHeader
				title={existing ? `Edit ${existing.transferNumber}` : "New transfer"}
				description="Move stock from one location to another. Nothing moves until you post it."
			/>

			{banner ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					<span>{banner.message}</span>
					{banner.notDraft && detailHref ? (
						<Link href={detailHref} className="font-medium underline">
							Open the transfer
						</Link>
					) : null}
				</div>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Transfer details</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-x-4 gap-y-2 md:grid-cols-2">
					<Field
						id="st-from"
						label="From location *"
						error={fieldErrors.from ?? sourceError}
					>
						<Select
							value={sourceId}
							disabled={isPending}
							onValueChange={(value) => {
								setSourceId(value);
								if (value === destId) setDestId("");
								touch();
							}}
						>
							<SelectTrigger id="st-from" className="w-full">
								<SelectValue placeholder="Select location" />
							</SelectTrigger>
							<SelectContent>
								{locations.map((l) => (
									<SelectItem key={l.id} value={String(l.id)}>
										{l.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field
						id="st-to"
						label="To location *"
						error={fieldErrors.to ?? destError}
					>
						<Select
							value={destId}
							disabled={isPending}
							onValueChange={(value) => {
								setDestId(value);
								touch();
							}}
						>
							<SelectTrigger id="st-to" className="w-full">
								<SelectValue placeholder="Select location" />
							</SelectTrigger>
							<SelectContent>
								{destOptions.map((l) => (
									<SelectItem key={l.id} value={String(l.id)}>
										{l.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field id="st-notes" label="Note" className="md:col-span-2">
						<Textarea
							id="st-notes"
							value={notes}
							maxLength={ST_NOTE_MAX}
							disabled={isPending}
							onChange={(event) => {
								setNotes(event.target.value);
								touch();
							}}
						/>
					</Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent>
					<TransferLinesEditor
						rows={rows}
						sourceName={source?.name ?? null}
						balanceOf={balanceOf}
						lineErrors={NO_LINE_ERRORS}
						showErrors={showErrors}
						disabled={isPending}
						onPick={(key, itemId, label, unit) => {
							setRows((current) =>
								current.map((row) =>
									row.key === key ? { ...row, itemId, label, unit } : row,
								),
							);
							touch();
						}}
						onQtyChange={(key, qty) => {
							setRows((current) =>
								current.map((row) => (row.key === key ? { ...row, qty } : row)),
							);
							touch();
						}}
						onRemove={(key) => {
							setRows((current) => current.filter((row) => row.key !== key));
							touch();
						}}
						onAdd={() => {
							setRows((current) => [
								...current,
								{
									key: nextKey(),
									itemId: null,
									label: "",
									unit: null,
									qty: "",
								},
							]);
							setDirty(true);
						}}
					/>
				</CardContent>
			</Card>

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
						<AlertDialogTitle>Discard changes?</AlertDialogTitle>
						<AlertDialogDescription>
							Your changes on this transfer are not saved yet.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction onClick={() => router.push(cancelHref)}>
							Discard
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</form>
	);
}
