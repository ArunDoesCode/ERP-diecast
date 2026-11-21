"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";

import { SearchableSelect } from "@/components/common/SearchableSelect";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	bomErrorMessage,
	useCreateBomMutation,
	useUpdateBomMutation,
} from "@/lib/api/bom/queries";
import { ApiClientError } from "@/lib/api/client";
import {
	useSupplierServicesQuery,
	useSuppliersQuery,
} from "@/lib/api/suppliers/queries";
import { formatQty } from "@/lib/format";
import {
	BOM_MAX_LINES,
	BOM_NOTE_MAX,
	type BomDetail,
	type BomDraftInput,
	type BomKind,
	bomKindLabels,
	bomKindValues,
} from "@/types/bom";
import type { AssetItemOption, Supplier } from "@/types/suppliers";
import { BomItemPicker } from "./BomItemPicker";

const isPart = (item: AssetItemOption) =>
	item.uom === "pcs" || item.uom === "set";
const isAlloy = (item: AssetItemOption) => item.uom === "kg";
const isPcs = (item: AssetItemOption) => item.uom === "pcs";

type LineState = {
	key: number;
	itemId?: number;
	itemLabel?: string;
	inactive: boolean;
	qty: string;
	buyAsIs: boolean;
	note: string;
};

let keySeed = 0;
function emptyLine(): LineState {
	keySeed += 1;
	return { key: keySeed, inactive: false, qty: "", buyAsIs: false, note: "" };
}

function str(value: number | null | undefined) {
	return value === null || value === undefined ? "" : String(value);
}

/** Empty -> undefined (field not sent); not a number -> NaN (caught before save). */
function num(value: string): number | undefined {
	const t = value.trim();
	if (t === "") return undefined;
	return Number(t);
}

function FormField({
	id,
	label,
	hint,
	error,
	children,
}: {
	id?: string;
	label: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
}) {
	return (
		<div className="min-h-19 space-y-1">
			{id ? (
				<Label htmlFor={id}>{label}</Label>
			) : (
				<span className="text-sm font-medium">{label}</span>
			)}
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
	existing?: BomDetail;
	presetPart?: { id: number; sku?: string; name?: string };
};

export function BomForm({ existing, presetPart }: Props) {
	const router = useRouter();
	const createMutation = useCreateBomMutation();
	const updateMutation = useUpdateBomMutation(existing?.id ?? 0);
	const isPending = createMutation.isPending || updateMutation.isPending;

	const [partId, setPartId] = useState<number | undefined>(
		existing?.partId ?? presetPart?.id,
	);
	const [partLabel, setPartLabel] = useState<string | undefined>(
		existing
			? `${existing.part.sku} · ${existing.part.name}`
			: presetPart?.sku
				? `${presetPart.sku}${presetPart.name ? ` · ${presetPart.name}` : ""}`
				: undefined,
	);
	const partLocked = existing !== undefined || presetPart !== undefined;
	const [kind, setKind] = useState<BomKind>(existing?.kind ?? "casting");

	const c = existing?.casting;
	const [alloyId, setAlloyId] = useState<number | undefined>(
		c?.alloyItemId ?? undefined,
	);
	const [alloyLabel, setAlloyLabel] = useState(
		c?.alloy ? `${c.alloy.sku} · ${c.alloy.name}` : undefined,
	);
	const [net, setNet] = useState(str(c?.netWeightKg));
	const [shot, setShot] = useState(str(c?.shotWeightKg));
	const [cavities, setCavities] = useState(str(c?.cavities));
	const [meltLoss, setMeltLoss] = useState(str(c?.meltLossPct));
	const [reject, setReject] = useState(str(c?.castingRejectPct));

	const j = existing?.jobWork;
	const [sentId, setSentId] = useState<number | undefined>(
		j?.sentItemId ?? undefined,
	);
	const [sentLabel, setSentLabel] = useState(
		j?.sentItem ? `${j.sentItem.sku} · ${j.sentItem.name}` : undefined,
	);
	const [sendQty, setSendQty] = useState(str(j?.sendQty ?? 1));
	const [returnQty, setReturnQty] = useState(str(j?.returnQty ?? 1));
	const [workerId, setWorkerId] = useState<number | undefined>(
		j?.jobWorkerId ?? undefined,
	);
	const [workerLabel, setWorkerLabel] = useState(j?.jobWorkerName ?? undefined);
	const [workerSearch, setWorkerSearch] = useState("");
	const debouncedWorker = useDebouncedValue(workerSearch, 300);
	const [serviceId, setServiceId] = useState<number | undefined>(
		j?.serviceId ?? undefined,
	);
	const [serviceLabel, setServiceLabel] = useState(j?.serviceName ?? undefined);
	const [jobLoss, setJobLoss] = useState(str(j?.jobWorkLossPct));

	const [lines, setLines] = useState<LineState[]>(() =>
		existing && existing.lines.length > 0
			? existing.lines.map((line) => {
					keySeed += 1;
					return {
						key: keySeed,
						itemId: line.componentItemId,
						itemLabel: `${line.sku} · ${line.name}`,
						inactive: line.inactive,
						qty: String(line.qtyPerPiece),
						buyAsIs: line.buyAsIs,
						note: line.note ?? "",
					};
				})
			: [],
	);

	const [showErrors, setShowErrors] = useState(false);
	const [banner, setBanner] = useState<ReactNode>(null);
	const [problems, setProblems] = useState<string[]>([]);

	const suppliersQuery = useSuppliersQuery({
		page: 1,
		pageSize: 50,
		sortBy: "name",
		sortDir: "asc",
		status: "active",
		q: debouncedWorker || undefined,
	});
	const workerOptions = useMemo(() => {
		const found = (suppliersQuery.data?.data ?? [])
			.filter(
				(supplier: Supplier) =>
					supplier.isActive &&
					(supplier.type === "service_provider" || supplier.type === "both"),
			)
			.map((supplier: Supplier) => ({
				value: String(supplier.id),
				label: supplier.name,
			}));
		if (workerId && !found.some((o) => o.value === String(workerId))) {
			found.unshift({
				value: String(workerId),
				label: workerLabel ?? `Supplier #${workerId}`,
			});
		}
		return found;
	}, [suppliersQuery.data?.data, workerId, workerLabel]);

	const servicesQuery = useSupplierServicesQuery(
		workerId ?? 0,
		{ page: 1, pageSize: 100 },
		Boolean(workerId),
	);
	const serviceOptions = useMemo(() => {
		const found = (servicesQuery.data?.data ?? [])
			.filter((row) => row.isActive)
			.map((row) => ({
				value: String(row.serviceId),
				label: row.serviceName,
			}));
		if (serviceId && !found.some((o) => o.value === String(serviceId))) {
			found.unshift({
				value: String(serviceId),
				label: serviceLabel ?? `Service #${serviceId}`,
			});
		}
		return found;
	}, [servicesQuery.data?.data, serviceId, serviceLabel]);

	// Display only: the server stays the source of truth (BR-BOM-05).
	const calc = useMemo(() => {
		const n = num(net);
		const s = num(shot);
		const cav = num(cavities);
		const melt = num(meltLoss) ?? 0;
		const rej = num(reject) ?? 0;
		if (!n || !s || !cav || [n, s, cav, melt, rej].some(Number.isNaN)) {
			return null;
		}
		const poured = s / cav;
		return {
			poured,
			yieldPct: ((n * cav) / s) * 100,
			alloyPerGood: n + (poured * (melt / 100)) / (1 - rej / 100),
		};
	}, [net, shot, cavities, meltLoss, reject]);

	function updateLine(key: number, patch: Partial<LineState>) {
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
		);
	}

	function fieldErrors(): Record<string, string> {
		const errors: Record<string, string> = {};
		if (!partId) errors.part = "Pick the part";
		const check = (name: string, value: string) => {
			if (value.trim() !== "" && Number.isNaN(Number(value))) {
				errors[name] = "Enter a number";
			}
		};
		if (kind === "casting") {
			check("net", net);
			check("shot", shot);
			check("cavities", cavities);
			check("meltLoss", meltLoss);
			check("reject", reject);
		}
		if (kind === "job_work") {
			check("sendQty", sendQty);
			check("returnQty", returnQty);
			check("jobLoss", jobLoss);
		}
		if (kind !== "job_work") {
			lines.forEach((line) => {
				if (!line.itemId) errors[`line-${line.key}-item`] = "Pick the item";
				const q = Number(line.qty);
				if (line.qty.trim() === "" || Number.isNaN(q) || q <= 0) {
					errors[`line-${line.key}-qty`] = "Enter a quantity above 0";
				}
				if (line.inactive) errors[`line-${line.key}-item`] = "Inactive item";
			});
		}
		return errors;
	}
	const errors = showErrors ? fieldErrors() : {};

	function buildDraft(): BomDraftInput {
		const draft: BomDraftInput = {
			kind,
			lines:
				kind === "job_work"
					? []
					: lines.map((line) => ({
							componentItemId: line.itemId as number,
							qtyPerPiece: Number(line.qty),
							buyAsIs: line.buyAsIs,
							...(line.note.trim() ? { note: line.note.trim() } : {}),
						})),
		};
		const drop = <T extends object>(o: T) =>
			Object.fromEntries(
				Object.entries(o).filter(([, v]) => v !== undefined),
			) as T;
		if (kind === "casting") {
			draft.casting = drop({
				alloyItemId: alloyId,
				netWeightKg: num(net),
				shotWeightKg: num(shot),
				cavities: num(cavities),
				meltLossPct: num(meltLoss),
				castingRejectPct: num(reject),
			});
		}
		if (kind === "job_work") {
			draft.jobWork = drop({
				sentItemId: sentId,
				sendQty: num(sendQty),
				returnQty: num(returnQty),
				jobWorkerId: workerId,
				serviceId,
				jobWorkLossPct: num(jobLoss),
			});
		}
		return draft;
	}

	function onError(error: unknown) {
		setProblems([]);
		if (error instanceof ApiClientError) {
			const body = error.body as { details?: unknown } | null;
			if (error.code === "BOM_ALREADY_EXISTS" && partId) {
				setBanner(
					<>
						{partLabel?.split(" · ")[0] ?? "This part"} already has a BOM.{" "}
						<Link
							href={`/bom/part/${partId}`}
							className="text-brand-accent underline"
						>
							Open it
						</Link>{" "}
						to start a revision.
					</>,
				);
				return;
			}
			if (Array.isArray(body?.details)) {
				const list = (body.details as { message?: string }[])
					.map((d) => d?.message)
					.filter((m): m is string => typeof m === "string");
				setProblems(list);
			}
			setBanner(error.message);
			return;
		}
		setBanner(bomErrorMessage(error, "Could not save the draft."));
	}

	function onSave() {
		setBanner(null);
		setProblems([]);
		setShowErrors(true);
		if (Object.keys(fieldErrors()).length > 0) return;
		const draft = buildDraft();
		if (existing) {
			updateMutation.mutate(
				{ ...draft, version: existing.version },
				{
					onSuccess: () =>
						router.push(
							`/bom/part/${existing.partId}?rev=${existing.revision}`,
						),
					onError,
				},
			);
		} else if (partId) {
			createMutation.mutate(
				{ ...draft, partId },
				{
					onSuccess: () => router.push(`/bom/part/${partId}?rev=A`),
					onError,
				},
			);
		}
	}

	const cancelHref = existing
		? `/bom/part/${existing.partId}?rev=${existing.revision}`
		: partId
			? `/bom/part/${partId}`
			: "/bom";

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title={existing ? `Edit ${existing.number}` : "New BOM"}
				description={
					existing ? undefined : "Write a draft. Release it from the part page."
				}
				actions={
					existing ? <StatusBadge doc="bom" status={existing.status} /> : null
				}
			/>

			{banner || problems.length > 0 ? (
				<div
					role="alert"
					className="rounded-md border border-destructive bg-destructive-subtle p-3 text-sm text-destructive"
				>
					{banner ? <p>{banner}</p> : null}
					{problems.length > 0 ? (
						<ul className="list-disc pl-5">
							{problems.map((p) => (
								<li key={p}>{p}</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Part and kind</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<FormField label="Part" error={errors.part}>
						{partLocked ? (
							<p className="flex h-9 items-center text-sm">
								{partLabel ?? `Item #${partId}`}
							</p>
						) : (
							<BomItemPicker
								value={partId}
								valueLabel={partLabel}
								placeholder="Select part"
								filter={isPart}
								onChange={(id, label) => {
									setPartId(id);
									setPartLabel(label);
								}}
							/>
						)}
					</FormField>
					<FormField label="Kind">
						<div
							role="radiogroup"
							aria-label="Kind"
							className="flex h-9 items-center gap-4"
						>
							{bomKindValues.map((value) => (
								<span key={value} className="flex items-center gap-1.5">
									<input
										type="radio"
										id={`bom-kind-${value}`}
										name="bom-kind"
										checked={kind === value}
										onChange={() => setKind(value)}
									/>
									<Label htmlFor={`bom-kind-${value}`}>
										{bomKindLabels[value]}
									</Label>
								</span>
							))}
						</div>
					</FormField>
					{existing ? (
						<FormField label="Revision">
							<p className="flex h-9 items-center text-sm">
								{existing.revision}
							</p>
						</FormField>
					) : null}
				</CardContent>
			</Card>

			{kind === "casting" ? (
				<Card>
					<CardHeader>
						<CardTitle>Casting data</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<FormField label="Alloy">
							<BomItemPicker
								value={alloyId}
								valueLabel={alloyLabel}
								placeholder="Select alloy"
								filter={isAlloy}
								onChange={(id, label) => {
									setAlloyId(id);
									setAlloyLabel(label);
								}}
							/>
						</FormField>
						<FormField id="bom-net" label="Net weight (kg)" error={errors.net}>
							<Input
								id="bom-net"
								inputMode="decimal"
								value={net}
								onChange={(e) => setNet(e.target.value)}
								className="text-right tabular-nums"
							/>
						</FormField>
						<FormField
							id="bom-shot"
							label="Shot weight (kg)"
							hint="At least net × cavities"
							error={errors.shot}
						>
							<Input
								id="bom-shot"
								inputMode="decimal"
								value={shot}
								onChange={(e) => setShot(e.target.value)}
								className="text-right tabular-nums"
							/>
						</FormField>
						<FormField
							id="bom-cavities"
							label="Cavities"
							error={errors.cavities}
						>
							<Input
								id="bom-cavities"
								inputMode="numeric"
								value={cavities}
								onChange={(e) => setCavities(e.target.value)}
								className="text-right tabular-nums"
							/>
						</FormField>
						<FormField
							id="bom-melt"
							label="Melt loss (%)"
							error={errors.meltLoss}
						>
							<Input
								id="bom-melt"
								inputMode="decimal"
								value={meltLoss}
								onChange={(e) => setMeltLoss(e.target.value)}
								className="text-right tabular-nums"
							/>
						</FormField>
						<FormField
							id="bom-reject"
							label="Casting reject (%)"
							error={errors.reject}
						>
							<Input
								id="bom-reject"
								inputMode="decimal"
								value={reject}
								onChange={(e) => setReject(e.target.value)}
								className="text-right tabular-nums"
							/>
						</FormField>
						<p className="text-sm text-muted-foreground md:col-span-2">
							Calculated:{" "}
							{calc
								? `poured ${formatQty(calc.poured, "kg", 3)} · yield ${formatQty(calc.yieldPct, null, 1)} % · alloy per good piece ${formatQty(calc.alloyPerGood, "kg", 3)}`
								: "fill net weight, shot weight and cavities"}
						</p>
					</CardContent>
				</Card>
			) : null}

			{kind === "job_work" ? (
				<Card>
					<CardHeader>
						<CardTitle>Job work</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<FormField label="Sent item">
							<BomItemPicker
								value={sentId}
								valueLabel={sentLabel}
								placeholder="Select sent item"
								filter={isPcs}
								onChange={(id, label) => {
									setSentId(id);
									setSentLabel(label);
								}}
							/>
						</FormField>
						<div className="grid grid-cols-2 gap-4">
							<FormField id="bom-send" label="Send" error={errors.sendQty}>
								<Input
									id="bom-send"
									inputMode="numeric"
									value={sendQty}
									onChange={(e) => setSendQty(e.target.value)}
									className="text-right tabular-nums"
								/>
							</FormField>
							<FormField
								id="bom-return"
								label="Return"
								error={errors.returnQty}
							>
								<Input
									id="bom-return"
									inputMode="numeric"
									value={returnQty}
									onChange={(e) => setReturnQty(e.target.value)}
									className="text-right tabular-nums"
								/>
							</FormField>
						</div>
						<FormField label="Job worker">
							<SearchableSelect
								value={workerId ? String(workerId) : undefined}
								options={workerOptions}
								onValueChange={(value) => {
									const next = Number(value);
									if (next === workerId) return;
									setWorkerId(next);
									setWorkerLabel(
										workerOptions.find((o) => o.value === value)?.label,
									);
									// Services belong to the worker: the old pick no longer applies.
									setServiceId(undefined);
									setServiceLabel(undefined);
								}}
								searchValue={workerSearch}
								onSearchChange={setWorkerSearch}
								placeholder="Select job worker"
								searchPlaceholder="Search suppliers"
								emptyText="No match. Only active suppliers of type Service provider or Both can do job work."
								isLoading={suppliersQuery.isLoading}
							/>
						</FormField>
						<FormField label="Service">
							<Select
								value={serviceId ? String(serviceId) : undefined}
								onValueChange={(value) => {
									setServiceId(Number(value));
									setServiceLabel(
										serviceOptions.find((o) => o.value === value)?.label,
									);
								}}
								disabled={!workerId}
							>
								<SelectTrigger className="w-full" aria-label="Service">
									<SelectValue
										placeholder={
											workerId ? "Select service" : "Pick a job worker first"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{serviceOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
						<FormField
							id="bom-job-loss"
							label="Loss (%)"
							error={errors.jobLoss}
						>
							<Input
								id="bom-job-loss"
								inputMode="decimal"
								value={jobLoss}
								onChange={(e) => setJobLoss(e.target.value)}
								className="text-right tabular-nums"
							/>
						</FormField>
					</CardContent>
				</Card>
			) : null}

			{kind !== "job_work" ? (
				<Card>
					<CardHeader>
						<CardTitle>Components</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{lines.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No components yet.
							</p>
						) : null}
						{lines.map((line, index) => (
							<div
								key={line.key}
								className="grid items-start gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,2fr)_9rem_auto_minmax(0,2fr)_auto]"
							>
								<FormField
									label={`Item ${index + 1}`}
									error={errors[`line-${line.key}-item`]}
								>
									<BomItemPicker
										value={line.itemId}
										valueLabel={line.itemLabel}
										placeholder="Select item"
										onChange={(id, label) =>
											updateLine(line.key, {
												itemId: id,
												itemLabel: label,
												inactive: false,
											})
										}
									/>
									{line.inactive ? (
										<span className="text-[13px] text-destructive">
											Inactive
										</span>
									) : null}
								</FormField>
								<FormField
									id={`bom-line-qty-${line.key}`}
									label="Qty per piece"
									error={errors[`line-${line.key}-qty`]}
								>
									<Input
										id={`bom-line-qty-${line.key}`}
										inputMode="decimal"
										value={line.qty}
										onChange={(e) =>
											updateLine(line.key, { qty: e.target.value })
										}
										className="text-right tabular-nums"
									/>
								</FormField>
								<div className="flex h-9 items-center gap-2 lg:mt-6">
									<Checkbox
										id={`bom-line-buy-${line.key}`}
										checked={line.buyAsIs}
										onCheckedChange={(checked) =>
											updateLine(line.key, { buyAsIs: checked === true })
										}
									/>
									<Label htmlFor={`bom-line-buy-${line.key}`}>Buy as is</Label>
								</div>
								<FormField id={`bom-line-note-${line.key}`} label="Note">
									<Input
										id={`bom-line-note-${line.key}`}
										value={line.note}
										maxLength={BOM_NOTE_MAX}
										onChange={(e) =>
											updateLine(line.key, { note: e.target.value })
										}
									/>
								</FormField>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="lg:mt-6"
									aria-label={`Remove line ${index + 1}`}
									onClick={() =>
										setLines((current) =>
											current.filter((l) => l.key !== line.key),
										)
									}
								>
									<IconTrash />
								</Button>
							</div>
						))}
						<div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={lines.length >= BOM_MAX_LINES}
								onClick={() => setLines((current) => [...current, emptyLine()])}
							>
								<IconPlus />
								Add line
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}

			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" asChild>
					<Link href={cancelHref}>Cancel</Link>
				</Button>
				<Button type="button" disabled={isPending} onClick={onSave}>
					{isPending ? "Saving…" : "Save draft"}
				</Button>
			</div>
		</div>
	);
}
