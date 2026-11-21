"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import {
	DnActionDialogs,
	type DnDialog,
} from "@/components/pages/delivery-notes/DnActionDialogs";
import { DnEwayHint } from "@/components/pages/delivery-notes/DnEwayHint";
import { DnBanner, DnField } from "@/components/pages/delivery-notes/DnField";
import {
	type DnLineInfo,
	type DnLineState,
	DnLinesEditor,
} from "@/components/pages/delivery-notes/DnLinesEditor";
import {
	type DnPackageRow,
	DnPackagesEditor,
	type PackLine,
	packagesInvalid,
} from "@/components/pages/delivery-notes/DnPackagesEditor";
import { DnTransportFields } from "@/components/pages/delivery-notes/DnTransportFields";
import {
	distanceError,
	emptyTransport,
	ewayNoError,
	isSameState,
	lineQtyError,
	type TransportDraft,
	transporterIdError,
	transportFromDetail,
	transportPayload,
	vehicleError,
} from "@/components/pages/delivery-notes/dn-format";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { useMinWidth } from "@/hooks/use-min-width";
import { ApiClientError } from "@/lib/api/client";
import {
	dnErrorMessage,
	useCreateDeliveryNoteMutation,
	usePendingDispatchQuery,
	useUpdateDeliveryNoteMutation,
} from "@/lib/api/delivery-note/queries";
import {
	EWAY_OTHER_STATE_LIMIT_PAISE,
	noteTotals,
} from "@/lib/delivery-note-math";
import { formatDate } from "@/lib/format";
import { istTodayIso } from "@/lib/ist-date";
import {
	DN_PENDING_PAGE_SIZE,
	DN_REMARKS_MAX,
	type DnCreatePayload,
	type DnDetail,
	type DnLineInput,
	type DnPackageInput,
	type DnSettings,
} from "@/types/delivery-note";
import type { SoDetail } from "@/types/sale-order";

export type DnLocationOption = { id: number; name: string };

type SoFacts = {
	soNumber: string;
	customerPoNumber: string | null;
	customerName: string;
	address: string;
	stateCode: string;
	gstin: string | null;
	shipToAddress: string;
	shipToStateCode: string;
};

/** Untouched line: ticked with its open qty when the link named it, else empty. */
function defaultLineState(info: DnLineInfo, preselect: boolean): DnLineState {
	return preselect
		? { picked: true, qty: String(info.open), lot: "" }
		: { picked: false, qty: "", lot: "" };
}

let packageSeq = 0;
const nextPackageKey = () => `p${++packageSeq}`;

function Facts({ facts }: { facts: SoFacts }) {
	const sameAsCustomer =
		facts.shipToAddress === facts.address &&
		facts.shipToStateCode === facts.stateCode;
	return (
		<div className="rounded-md bg-muted px-3 py-2 text-sm">
			<p>
				<span className="font-medium">{facts.customerName}</span>
				<span className="text-muted-foreground">
					{" "}
					· {facts.address} · State {facts.stateCode} ·{" "}
					{facts.gstin ? `GSTIN ${facts.gstin}` : "Unregistered"}
				</span>
			</p>
			<p className="text-muted-foreground">
				SO <span className="font-mono">{facts.soNumber}</span> · Customer PO{" "}
				{facts.customerPoNumber ?? "–"} ·{" "}
				{sameAsCustomer
					? "Ship-to same as customer"
					: `Ship-to ${facts.shipToAddress} (state ${facts.shipToStateCode})`}
			</p>
		</div>
	);
}

type Banner = { message: string; notEditable: boolean };

export function DeliveryNoteForm({
	soId,
	existing,
	locations,
	defaultLocationId,
	settings,
	so,
	preselectLineId,
}: {
	soId: number;
	existing?: DnDetail;
	locations: DnLocationOption[];
	defaultLocationId: number | undefined;
	settings: DnSettings | undefined;
	/** Sale order detail, only loaded for users with `so.view` (prices for the live value). */
	so: SoDetail | undefined;
	preselectLineId?: number;
}) {
	const router = useRouter();
	const canSoView = useCan("so.view");
	const canCompany = useCan("company.manage");
	const wide = useMinWidth(1100);
	const create = useCreateDeliveryNoteMutation();
	const update = useUpdateDeliveryNoteMutation();
	const isSaving = create.isPending || update.isPending;

	const [noteId, setNoteId] = useState<number | undefined>(existing?.id);
	const [serverEway, setServerEway] = useState<boolean | null>(
		existing ? existing.ewayNeeded : null,
	);
	const [noteDate, setNoteDate] = useState(existing?.noteDate ?? istTodayIso());
	const [locationId, setLocationId] = useState<number | undefined>(
		existing?.sourceLocation.id ?? defaultLocationId,
	);
	const [remarks, setRemarks] = useState(existing?.remarks ?? "");
	const [lineStates, setLineStates] = useState<Record<number, DnLineState>>(
		() => {
			const map: Record<number, DnLineState> = {};
			for (const line of existing?.lines ?? []) {
				map[line.soLineId] = {
					picked: true,
					qty: String(line.qty),
					lot: line.lotNo ?? "",
				};
			}
			return map;
		},
	);
	const [packages, setPackages] = useState<DnPackageRow[]>(() =>
		(existing?.packages ?? []).map((pkg) => ({
			key: nextPackageKey(),
			packageNo: pkg.packageNo,
			soLineId: pkg.soLineId,
			qty: String(pkg.qty),
			netKg: String(pkg.netKg),
			grossKg: String(pkg.grossKg),
			lot: pkg.lotNo ?? "",
		})),
	);
	const [transport, setTransport] = useState<TransportDraft>(() =>
		existing ? transportFromDetail(existing.transport) : emptyTransport(),
	);
	const [dirty, setDirty] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
	const [transportErrors, setTransportErrors] = useState<
		Record<string, string>
	>({});
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [postNote, setPostNote] = useState<DnDetail | null>(null);
	const [postDialog, setPostDialog] = useState<DnDialog | null>(null);

	const pending = usePendingDispatchQuery({
		soId,
		locationId,
		page: 1,
		pageSize: DN_PENDING_PAGE_SIZE,
		sortBy: "itemSku",
		sortDir: "asc",
	});
	const pendingRows = pending.data?.data;
	const headerMeta = pending.data?.meta.so;

	// Lines on the draft that are no longer open on the order stay editable (qty only).
	const infos = useMemo<DnLineInfo[]>(() => {
		const priceOf = (soLineId: number) => {
			const soLine = so?.lines.find((line) => line.id === soLineId);
			if (soLine) {
				return {
					unitPricePaise: soLine.unitPricePaise,
					gstPercent: soLine.gstPercent,
				};
			}
			const own = existing?.lines.find((line) => line.soLineId === soLineId);
			return own?.unitPricePaise !== undefined && own.gstPercent !== undefined
				? { unitPricePaise: own.unitPricePaise, gstPercent: own.gstPercent }
				: {};
		};
		const out: DnLineInfo[] = (pendingRows ?? []).map((row) => ({
			soLineId: row.soLineId,
			sku: row.item.sku,
			name: row.item.name,
			uom: row.uom,
			deliveryDate: row.deliveryDate,
			ordered: row.ordered,
			delivered: row.delivered,
			open: row.open,
			stock: row.stockAtLocation,
			...priceOf(row.soLineId),
		}));
		for (const line of existing?.lines ?? []) {
			if (out.some((info) => info.soLineId === line.soLineId)) continue;
			out.push({
				soLineId: line.soLineId,
				sku: line.item.sku,
				name: line.item.name,
				uom: line.uom,
				deliveryDate: line.deliveryDate,
				ordered: null,
				delivered: null,
				open: line.openQtyAtRead,
				stock: null,
				...priceOf(line.soLineId),
			});
		}
		return out;
	}, [pendingRows, existing, so]);

	const states = useMemo(() => {
		const map: Record<number, DnLineState> = {};
		for (const info of infos) {
			map[info.soLineId] =
				lineStates[info.soLineId] ??
				defaultLineState(info, !existing && info.soLineId === preselectLineId);
		}
		return map;
	}, [infos, lineStates, preselectLineId, existing]);

	const picked = infos.filter((info) => states[info.soLineId]?.picked);
	const showMoney =
		canSoView &&
		infos.length > 0 &&
		infos.every((info) => info.unitPricePaise !== undefined);
	const totals = useMemo(() => {
		if (!showMoney) return null;
		return noteTotals(
			picked.map((info) => ({
				qty: Number(states[info.soLineId]?.qty) || 0,
				unitPricePaise: info.unitPricePaise ?? 0,
				gstPercent: info.gstPercent ?? 0,
			})),
		);
	}, [showMoney, picked, states]);

	const facts: SoFacts | null = existing
		? {
				soNumber: existing.soNumber,
				customerPoNumber: existing.customerPoNumber,
				customerName: existing.customer.name,
				address: existing.customer.address,
				stateCode: existing.customer.stateCode,
				gstin: existing.customer.gstin,
				shipToAddress: existing.shipTo.address,
				shipToStateCode: existing.shipTo.stateCode,
			}
		: headerMeta
			? {
					soNumber: headerMeta.soNumber,
					customerPoNumber: headerMeta.customerPoNumber,
					customerName: headerMeta.customer.name,
					address: headerMeta.customer.address,
					stateCode: headerMeta.customer.stateCode,
					gstin: headerMeta.customer.gstin,
					shipToAddress: headerMeta.shipTo.address,
					shipToStateCode: headerMeta.shipTo.stateCode,
				}
			: null;

	const sameState = isSameState(
		settings?.plantStateCode,
		facts?.shipToStateCode,
	);
	const limitPaise =
		settings?.ewayIntraLimitPaise ?? existing?.ewayLimitPaise ?? 5_000_000;
	const needed =
		totals && sameState !== null
			? totals.valuePaise >=
				(sameState ? limitPaise : EWAY_OTHER_STATE_LIMIT_PAISE)
			: serverEway === true;

	// Note date must not be before the order date; the pending rows carry it.
	const soDate = pendingRows?.[0]?.soDate;
	const today = istTodayIso();
	const dateError =
		noteDate === ""
			? "Pick a date"
			: noteDate > today
				? "The date cannot be in the future"
				: soDate && noteDate < soDate
					? `The date cannot be before the order date (${formatDate(soDate)})`
					: null;

	const packLines: PackLine[] = picked.map((info) => ({
		soLineId: info.soLineId,
		sku: info.sku,
		uom: info.uom,
		qty: Number(states[info.soLineId]?.qty) || 0,
		lot: states[info.soLineId]?.lot ?? "",
	}));

	const pickedProblems = picked.some(
		(info) =>
			lineQtyError(states[info.soLineId]?.qty ?? "", info.uom, info.open) !==
			null,
	);
	const noLines = picked.length === 0;
	const transportProblems =
		vehicleError(transport.vehicleNo) ||
		transporterIdError(transport.transporterId) ||
		ewayNoError(transport.ewayBillNo) ||
		distanceError(transport.distanceKm);
	const blocked =
		noLines ||
		pickedProblems ||
		dateError !== null ||
		packagesInvalid(packages, packLines) ||
		Boolean(transportProblems);

	const soNotConfirmed =
		existing !== undefined && existing.soStatus !== "confirmed";
	const detailHref = noteId ? `/delivery-notes/${noteId}` : null;
	const cancelHref = detailHref ?? "/delivery-notes/pending";

	function touched() {
		setDirty(true);
		setBanner(null);
		setLineErrors({});
		setTransportErrors({});
	}

	function onToggle(info: DnLineInfo, isPicked: boolean) {
		setLineStates((current) => ({
			...current,
			[info.soLineId]: isPicked
				? {
						picked: true,
						qty: String(info.open),
						lot: states[info.soLineId]?.lot ?? "",
					}
				: { picked: false, qty: "", lot: "" },
		}));
		touched();
	}

	function buildLines(): DnLineInput[] {
		return picked.map((info) => ({
			soLineId: info.soLineId,
			qty: Number(states[info.soLineId]?.qty),
			lotNo: states[info.soLineId]?.lot.trim() || null,
		}));
	}
	function buildPackages(): DnPackageInput[] {
		return packages.map((row) => ({
			soLineId: row.soLineId as number,
			packageNo: row.packageNo.trim(),
			qty: Number(row.qty),
			netKg: Number(row.netKg),
			grossKg: Number(row.grossKg),
			lotNo: row.lot.trim() || null,
		}));
	}

	function onError(error: unknown) {
		if (
			error instanceof ApiClientError &&
			error.code === "DISPATCH_EWAY_REUSED"
		) {
			setTransportErrors({
				ewayBillNo: dnErrorMessage(error, "E-way bill number already used"),
			});
			return;
		}
		setBanner({
			message: dnErrorMessage(error, "Could not save the delivery note."),
			notEditable:
				error instanceof ApiClientError &&
				error.code === "DISPATCH_NOTE_STATUS",
		});
	}

	/** Saves the draft (create the first time, patch after), then calls `then` with the saved note. */
	function save(then: (note: DnDetail) => void) {
		setShowErrors(true);
		setBanner(null);
		setLineErrors({});
		setTransportErrors({});
		if (blocked) return;
		const common = {
			noteDate,
			sourceLocationId: locationId,
			lines: buildLines(),
			transport: transportPayload(transport),
		};
		if (noteId !== undefined) {
			update.mutate(
				{
					id: noteId,
					payload: {
						...common,
						remarks: remarks.trim() || null,
						packages: buildPackages(),
					},
				},
				{
					onSuccess: (result) => {
						setDirty(false);
						setServerEway(result.data.ewayNeeded);
						then(result.data);
					},
					onError,
				},
			);
			return;
		}
		const payload: DnCreatePayload = {
			soId,
			...common,
			remarks: remarks.trim() || undefined,
			packages: packages.length > 0 ? buildPackages() : undefined,
		};
		create.mutate(payload, {
			onSuccess: (result) => {
				setDirty(false);
				setNoteId(result.data.id);
				setServerEway(result.data.ewayNeeded);
				then(result.data);
			},
			onError,
		});
	}

	function onSubmit(event?: FormEvent) {
		event?.preventDefault();
		save((note) => router.push(`/delivery-notes/${note.id}`));
	}

	function onPost() {
		save((note) => {
			setPostNote(note);
			setPostDialog("post");
		});
	}

	function onCancel() {
		if (dirty) setLeaveOpen(true);
		else router.push(cancelHref);
	}

	const lineCount = pending.isLoading;
	const truncated =
		(pending.data?.meta.total ?? 0) > DN_PENDING_PAGE_SIZE
			? "Only the first 100 open lines are listed."
			: null;

	return (
		<form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
			<PageHeader title={existing ? "Edit draft" : "New delivery note"} />

			{soNotConfirmed ? (
				<DnBanner tone="warning">
					<span>
						This order is{" "}
						{existing?.soStatus === "on_hold" ? "on hold" : "closed"}. Delivery
						cannot start. You can save the draft, but not post it.
					</span>
					{canSoView ? (
						<Link
							href={`/sale-orders/${soId}`}
							className="font-medium underline"
						>
							Open the order
						</Link>
					) : null}
				</DnBanner>
			) : null}
			{banner ? (
				<DnBanner tone="danger">
					<span>
						{banner.notEditable
							? "This note is no longer a draft."
							: banner.message}
					</span>
					{banner.notEditable && detailHref ? (
						<Link href={detailHref} className="font-medium underline">
							Open the note
						</Link>
					) : null}
				</DnBanner>
			) : null}
			{showErrors && blocked && !banner ? (
				<DnBanner tone="danger">
					<span>
						{noLines
							? "Tick at least one line to ship."
							: "Fix the highlighted fields before saving."}
					</span>
				</DnBanner>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Customer and order</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{facts ? (
						<Facts facts={facts} />
					) : (
						<Skeleton className="h-12 w-full" />
					)}
					<div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
						<DnField id="dn-date" label="Note date *" error={dateError}>
							<Input
								id="dn-date"
								type="date"
								className="h-10"
								value={noteDate}
								max={today}
								min={soDate}
								disabled={isSaving}
								onChange={(event) => {
									setNoteDate(event.target.value);
									touched();
								}}
							/>
						</DnField>
						<DnField id="dn-location" label="Ship from *">
							<Select
								value={
									locationId === undefined ? undefined : String(locationId)
								}
								disabled={isSaving}
								onValueChange={(value) => {
									setLocationId(Number(value));
									touched();
								}}
							>
								<SelectTrigger id="dn-location" className="h-10 w-full">
									<SelectValue placeholder="Pick a location" />
								</SelectTrigger>
								<SelectContent>
									{locations.map((location) => (
										<SelectItem key={location.id} value={String(location.id)}>
											{location.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</DnField>
						<DnField id="dn-remarks" label="Remarks" className="md:col-span-2">
							<Textarea
								id="dn-remarks"
								value={remarks}
								maxLength={DN_REMARKS_MAX}
								disabled={isSaving}
								onChange={(event) => {
									setRemarks(event.target.value);
									touched();
								}}
							/>
						</DnField>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{lineCount && infos.length === 0 ? (
						<Skeleton className="h-32 w-full" />
					) : (
						<DnLinesEditor
							infos={infos}
							states={states}
							wide={wide}
							showMoney={showMoney}
							totals={totals}
							showErrors={showErrors}
							disabled={isSaving}
							serverErrors={lineErrors}
							onToggle={onToggle}
							onQty={(soLineId, qty) => {
								setLineStates((current) => ({
									...current,
									[soLineId]: {
										...(current[soLineId] ??
											states[soLineId] ?? { picked: true, qty: "", lot: "" }),
										qty,
									},
								}));
								touched();
							}}
							onLot={(soLineId, lot) => {
								setLineStates((current) => ({
									...current,
									[soLineId]: {
										...(current[soLineId] ??
											states[soLineId] ?? { picked: true, qty: "", lot: "" }),
										lot,
									},
								}));
								touched();
							}}
						/>
					)}
					{truncated ? (
						<p className="text-[13px] text-muted-foreground">{truncated}</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Packing list (optional)</CardTitle>
				</CardHeader>
				<CardContent>
					<DnPackagesEditor
						rows={packages}
						lines={packLines}
						wide={wide}
						showErrors={showErrors}
						disabled={isSaving}
						serverErrors={{}}
						onChange={(key, patch) => {
							setPackages((current) =>
								current.map((row) =>
									row.key === key ? { ...row, ...patch } : row,
								),
							);
							touched();
						}}
						onRemove={(key) => {
							setPackages((current) =>
								current.filter((row) => row.key !== key),
							);
							touched();
						}}
						onAdd={() => {
							setPackages((current) => [
								...current,
								{
									key: nextPackageKey(),
									packageNo: String(current.length + 1),
									soLineId:
										packLines.length === 1 ? packLines[0].soLineId : null,
									qty: "",
									netKg: "",
									grossKg: "",
									lot: packLines.length === 1 ? packLines[0].lot : "",
								},
							]);
							touched();
						}}
						onDuplicate={() => {
							setPackages((current) => {
								const last = current[current.length - 1];
								if (!last) return current;
								const numeric = Number(last.packageNo);
								return [
									...current,
									{
										...last,
										key: nextPackageKey(),
										packageNo: Number.isInteger(numeric)
											? String(numeric + 1)
											: `${last.packageNo}-2`,
									},
								];
							});
							touched();
						}}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Transport and e-way bill</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<DnEwayHint
						valuePaise={showMoney && totals ? totals.valuePaise : undefined}
						limitPaise={limitPaise}
						sameState={sameState}
						serverNeeded={serverEway}
						canSetCompany={canCompany}
					/>
					<DnTransportFields
						draft={transport}
						onChange={(patch) => {
							setTransport((current) => ({ ...current, ...patch }));
							touched();
						}}
						needed={needed}
						disabled={isSaving}
						showErrors={showErrors}
						serverErrors={transportErrors}
					/>
				</CardContent>
			</Card>

			<div className="flex flex-wrap justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={isSaving}
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button type="submit" variant="outline" disabled={isSaving}>
					{isSaving ? "Saving…" : "Save draft"}
				</Button>
				<Button
					type="button"
					disabled={isSaving || soNotConfirmed}
					onClick={onPost}
				>
					{isSaving ? "Saving…" : "Post note"}
				</Button>
			</div>

			{postNote ? (
				<DnActionDialogs
					note={postNote}
					open={postDialog}
					onClose={() => {
						setPostDialog(null);
						// A first save made a draft: carry on editing that draft, never a second one.
						if (!existing)
							router.replace(`/delivery-notes/${postNote.id}/edit`);
					}}
					onPosted={(note) => router.push(`/delivery-notes/${note.id}`)}
				/>
			) : null}

			<AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Leave without saving?</AlertDialogTitle>
						<AlertDialogDescription>
							Your changes on this delivery note are not saved yet.
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
