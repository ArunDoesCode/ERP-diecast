"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

import { DueMark } from "@/components/pages/grn/ReceivePickerRow";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ApiClientError } from "@/lib/api/client";
import {
	useCreateGrnMutation,
	useReceivablePosQuery,
} from "@/lib/api/grn/queries";
import type { ReceivableLine } from "@/lib/api/grn/receivable-types";
import { formatDocNo, formatQty } from "@/lib/format";
import { isWholeUom, qtyStep } from "@/lib/grn-units";

const PICKER_HREF = "/grn/receive";

function parseQty(raw: string | undefined) {
	const text = (raw ?? "").trim();
	if (text === "") return null;
	const n = Number(text);
	return Number.isFinite(n) ? n : Number.NaN;
}

function lineError(line: ReceivableLine, raw: string | undefined) {
	const n = parseQty(raw);
	if (n === null) return null;
	if (Number.isNaN(n) || n < 0) return "Enter a valid quantity";
	if (isWholeUom(line.uom) && !Number.isInteger(n)) return "Whole numbers only";
	return null;
}

function overBy(line: ReceivableLine, raw: string | undefined) {
	const n = parseQty(raw);
	if (n === null || Number.isNaN(n)) return 0;
	return Math.round((n - line.openQty) * 1000) / 1000;
}

function BackToPicker({ children }: { children: string }) {
	return (
		<Link href={PICKER_HREF} className="text-brand-accent hover:underline">
			{children}
		</Link>
	);
}

export function GrnReceiveFormView() {
	const router = useRouter();
	const canReceive = useCan("grn.edit_draft");
	const [poId] = useQueryState("po", parseAsInteger);

	const query = useReceivablePosQuery(
		{ poId: poId ?? undefined },
		canReceive && poId != null,
	);
	const createMutation = useCreateGrnMutation();

	const [challanNo, setChallanNo] = useState("");
	const [vehicleNo, setVehicleNo] = useState("");
	const [driverName, setDriverName] = useState("");
	const [arrived, setArrived] = useState<Record<number, string>>({});
	const [submitted, setSubmitted] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [finished, setFinished] = useState(false);

	const dirty =
		challanNo.trim() !== "" ||
		vehicleNo.trim() !== "" ||
		driverName.trim() !== "" ||
		Object.values(arrived).some((v) => v.trim() !== "");
	useUnsavedChangesGuard(dirty && !finished);

	const po = query.data?.data[0];
	const today = query.data?.meta.today;

	if (!canReceive) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Receive goods" />
				<p className="text-sm text-muted-foreground">
					You do not have access to receive goods.{" "}
					<BackToPicker>Back</BackToPicker>
				</p>
			</div>
		);
	}

	if (poId == null) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Receive goods" />
				<p className="text-sm text-muted-foreground">
					No order picked. <BackToPicker>Pick an order to receive</BackToPicker>
				</p>
			</div>
		);
	}

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Receive goods" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-11 w-full" />
				<Skeleton className="h-11 w-full" />
			</div>
		);
	}

	if (query.isError) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Receive goods" />
				<ErrorState
					message={
						query.error instanceof Error
							? query.error.message
							: "The order could not be loaded."
					}
					onRetry={() => {
						void query.refetch();
					}}
					retrying={query.isRefetching}
				/>
			</div>
		);
	}

	if (!po) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Receive goods" />
				<p className="text-sm text-muted-foreground">
					This order can no longer be received.{" "}
					<BackToPicker>Back to the orders list</BackToPicker>
				</p>
			</div>
		);
	}

	const order = po;
	const lineErrors = order.lines.map((line) =>
		lineError(line, arrived[line.poItemId]),
	);
	const filled = order.lines.filter((line) => {
		const n = parseQty(arrived[line.poItemId]);
		return n !== null && !Number.isNaN(n) && n > 0;
	});
	const challanMissing = challanNo.trim() === "";
	const noQty = filled.length === 0;
	const hasLineError = lineErrors.some((e) => e !== null);

	function fillOpen() {
		setArrived((current) => {
			const next = { ...current };
			for (const line of order.lines) {
				if ((next[line.poItemId] ?? "").trim() === "") {
					next[line.poItemId] = String(line.openQty);
				}
			}
			return next;
		});
	}

	async function save() {
		setSubmitted(true);
		setServerError(null);
		if (challanMissing || noQty || hasLineError) return;

		setSaving(true);
		try {
			const result = await createMutation.mutateAsync({
				poId: order.poId,
				challanNo: challanNo.trim(),
				vehicleNo: vehicleNo.trim() || undefined,
				driverName: driverName.trim() || undefined,
				lines: filled.map((line) => ({
					poItemId: line.poItemId,
					arrivedQty: Number(arrived[line.poItemId]),
				})),
			});
			if (!result.success) {
				setServerError(result.message);
				setSaving(false);
				return;
			}
			setFinished(true);
			router.push(`/grn/${result.data.grn.id}`);
		} catch (error) {
			setSaving(false);
			// BR-FF-72: the order may have stopped being receivable while the form was open.
			const fresh = await query.refetch();
			if (fresh.data && fresh.data.data.length === 0) {
				setFinished(true);
				toast.error("This order can no longer be received");
				router.push(PICKER_HREF);
				return;
			}
			setServerError(
				error instanceof ApiClientError
					? error.message
					: "The goods receipt could not be saved.",
			);
		}
	}

	const busy = saving || createMutation.isPending;

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title={`Receive goods · ${formatDocNo(order.poNumber)}`}
				description={order.supplierName ?? undefined}
				actions={
					<>
						<Button asChild variant="outline" size="lg">
							<Link href={PICKER_HREF}>Cancel</Link>
						</Button>
						<Button
							type="submit"
							form="grn-receive-form"
							size="lg"
							disabled={busy}
						>
							{busy ? "Saving…" : "Save goods receipt"}
						</Button>
					</>
				}
			/>

			<TwoPaneLayout
				sideLabel="Order summary"
				side={
					<div className="space-y-3 rounded-md border p-4 text-sm">
						<h2 className="text-[13px] leading-[18px] font-semibold tracking-wide text-muted-foreground uppercase">
							Order
						</h2>
						<dl className="grid grid-cols-[6rem_1fr] gap-y-2">
							<dt className="text-muted-foreground">Order</dt>
							<dd className="font-mono">{formatDocNo(order.poNumber)}</dd>
							<dt className="text-muted-foreground">Supplier</dt>
							<dd>{order.supplierName ?? "–"}</dd>
							<dt className="text-muted-foreground">Due</dt>
							<dd>
								<DueMark
									dueDate={order.dueDate}
									isLate={order.isLate}
									today={today}
								/>
							</dd>
							<dt className="text-muted-foreground">Status</dt>
							<dd>
								<StatusBadge doc="po" status={order.status} />
							</dd>
						</dl>
					</div>
				}
			>
				<form
					id="grn-receive-form"
					noValidate
					className="space-y-6"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					{serverError ? (
						<p
							role="alert"
							className="rounded-md border border-destructive/40 bg-destructive-subtle px-3 py-2 text-sm text-destructive"
						>
							{serverError}
						</p>
					) : null}

					<div className="grid gap-4 md:grid-cols-3">
						<div className="space-y-1.5">
							<Label htmlFor="grn-challan-no">Challan number *</Label>
							<Input
								id="grn-challan-no"
								className="h-10"
								value={challanNo}
								aria-invalid={submitted && challanMissing}
								onChange={(event) => setChallanNo(event.target.value)}
							/>
							{submitted && challanMissing ? (
								<p className="text-sm text-destructive">
									Enter the challan number
								</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="grn-vehicle-no">Vehicle</Label>
							<Input
								id="grn-vehicle-no"
								className="h-10"
								value={vehicleNo}
								onChange={(event) => setVehicleNo(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="grn-driver-name">Driver</Label>
							<Input
								id="grn-driver-name"
								className="h-10"
								value={driverName}
								onChange={(event) => setDriverName(event.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<h2 className="text-base font-semibold">Lines</h2>
							<Button
								type="button"
								variant="outline"
								size="lg"
								onClick={fillOpen}
							>
								Fill open quantity
							</Button>
						</div>
						<ul className="rounded-md border">
							{order.lines.map((line, index) => {
								const id = `grn-arrived-${line.poItemId}`;
								const over = overBy(line, arrived[line.poItemId]);
								const error = lineErrors[index];
								return (
									<li
										key={line.poItemId}
										className="grid min-h-11 gap-3 border-b px-3 py-3 last:border-b-0 md:grid-cols-[1fr_auto_auto_auto_11rem] md:items-center"
									>
										<div className="min-w-0">
											<p className="font-medium">{line.itemName ?? "–"}</p>
											<p className="text-sm text-muted-foreground">
												{line.sku ?? "–"}
											</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Ordered</p>
											<p>{formatQty(line.orderedQty, line.uom, 3)}</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Received so far</p>
											<p>
												{formatQty(
													line.receivedQty + line.pendingQaQty,
													line.uom,
													3,
												)}
											</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Open</p>
											<p className="font-semibold">
												{formatQty(line.openQty, line.uom, 3)}
											</p>
										</div>
										<div className="space-y-1">
											<Label htmlFor={id}>Arrived</Label>
											<div className="relative">
												<Input
													id={id}
													type="number"
													inputMode="decimal"
													min={0}
													step={qtyStep(line.uom)}
													value={arrived[line.poItemId] ?? ""}
													aria-invalid={error !== null}
													className="h-10 pr-12 text-right"
													onChange={(event) =>
														setArrived((current) => ({
															...current,
															[line.poItemId]: event.target.value,
														}))
													}
												/>
												<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
													{line.uom ?? ""}
												</span>
											</div>
											{error ? (
												<p className="text-sm text-destructive">{error}</p>
											) : over > 0 ? (
												<p className="text-sm text-warning">
													{formatQty(over, line.uom, 3)} above the order
												</p>
											) : null}
										</div>
									</li>
								);
							})}
						</ul>
						{submitted && noQty ? (
							<p role="alert" className="text-sm text-destructive">
								Enter at least one arrived quantity
							</p>
						) : null}
					</div>
				</form>
			</TwoPaneLayout>
		</div>
	);
}
