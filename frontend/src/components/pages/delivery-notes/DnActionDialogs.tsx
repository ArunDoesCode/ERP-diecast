"use client";

import { useState } from "react";
import { DnField } from "@/components/pages/delivery-notes/DnField";
import {
	distanceError,
	ewayNoError,
	groupEway,
	normaliseEway,
	normaliseTransporterId,
	normaliseVehicle,
	type TransportDraft,
	transporterIdError,
	transportFromDetail,
	vehicleError,
} from "@/components/pages/delivery-notes/dn-format";
import { ReasonDialog } from "@/components/shared/ReasonDialog";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api/client";
import {
	dnErrorMessage,
	useCancelDeliveryNoteDraftMutation,
	useCancelDeliveryNoteMutation,
	usePostDeliveryNoteMutation,
	useUpdateTransportMutation,
} from "@/lib/api/delivery-note/queries";
import { formatQty } from "@/lib/format";
import {
	type DnDetail,
	type DnTransportInput,
	dnQtyDecimals,
} from "@/types/delivery-note";

export type DnDialog = "post" | "cancelDraft" | "cancelPosted" | "transport";

function ErrorBox({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<div
			role="alert"
			className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
		>
			{message}
		</div>
	);
}

/** "600 pcs HSG-MC, 200 pcs BUSH-M6" for the post confirm text. */
function leavingText(note: DnDetail) {
	return note.lines
		.map(
			(line) =>
				`${formatQty(line.qty, line.uom, dnQtyDecimals(line.uom))} ${line.item.sku}`,
		)
		.join(", ");
}

const noteLabel = (note: DnDetail) =>
	note.dnNumber ?? `draft for ${note.soNumber}`;

export function DnActionDialogs({
	note,
	open,
	onClose,
	onPosted,
	onCancelled,
}: {
	note: DnDetail;
	open: DnDialog | null;
	onClose: () => void;
	/** Called after a successful post (the form leaves for the detail page). */
	onPosted?: (note: DnDetail) => void;
	onCancelled?: () => void;
}) {
	const post = usePostDeliveryNoteMutation(note.id);
	const cancelDraft = useCancelDeliveryNoteDraftMutation(note.id);
	const cancelPosted = useCancelDeliveryNoteMutation(note.id);
	const [error, setError] = useState<string | null>(null);

	function close(next: boolean) {
		if (!next) {
			setError(null);
			onClose();
		}
	}
	const fail = (fallback: string) => (err: unknown) =>
		setError(dnErrorMessage(err, fallback));

	return (
		<>
			<AlertDialog open={open === "post"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Post {noteLabel(note)}?</AlertDialogTitle>
						<AlertDialogDescription>
							{leavingText(note)} leave {note.sourceLocation.name}. A note
							number is given and the order's delivered quantity goes up. A
							posted note cannot be edited; a wrong one is cancelled and made
							again.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "post" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={post.isPending}>
							Keep draft
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={post.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								post.mutate(undefined, {
									onSuccess: (result) => {
										if (onPosted) {
											setError(null);
											onPosted(result.data);
										} else {
											close(false);
										}
									},
									onError: fail("Could not post the delivery note."),
								});
							}}
						>
							{post.isPending ? "Posting…" : "Post note"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ReasonDialog
				open={open === "cancelDraft"}
				onOpenChange={close}
				title={`Cancel draft ${noteLabel(note)}?`}
				description="The draft is cancelled for good. Nothing has moved yet, so stock and the order stay as they are."
				keepLabel="Keep draft"
				actionLabel="Cancel draft"
				pendingLabel="Cancelling…"
				pending={cancelDraft.isPending}
				error={open === "cancelDraft" ? error : null}
				onConfirm={(reason) => {
					setError(null);
					cancelDraft.mutate(
						{ reason },
						{
							onSuccess: () => {
								close(false);
								onCancelled?.();
							},
							onError: fail("Could not cancel the draft."),
						},
					);
				}}
			/>

			<ReasonDialog
				open={open === "cancelPosted"}
				onOpenChange={close}
				title={`Cancel note ${noteLabel(note)}?`}
				description={`The stock goes back to ${note.sourceLocation.name} and the order's delivered quantity goes down, so the quantity is open again. The note stays on record as cancelled.`}
				keepLabel="Keep note"
				actionLabel="Cancel note"
				pendingLabel="Cancelling…"
				pending={cancelPosted.isPending}
				error={open === "cancelPosted" ? error : null}
				onConfirm={(reason) => {
					setError(null);
					cancelPosted.mutate(
						{ reason },
						{
							onSuccess: () => {
								close(false);
								onCancelled?.();
							},
							onError: fail("Could not cancel the note."),
						},
					);
				}}
			/>

			{open === "transport" ? (
				<TransportDialog note={note} onClose={() => close(false)} />
			) : null}
		</>
	);
}

/** Update transport after posting (BR-DSP-27): mode is locked; e-way no., date and distance only when empty. */
function TransportDialog({
	note,
	onClose,
}: {
	note: DnDetail;
	onClose: () => void;
}) {
	const update = useUpdateTransportMutation(note.id);
	const original = transportFromDetail(note.transport);
	const [draft, setDraft] = useState<TransportDraft>(original);
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const road = (note.transport.mode ?? "road") === "road";
	const ewayEmpty = !note.transport.ewayBillNo;
	const patch = (next: Partial<TransportDraft>) => {
		setDraft((current) => ({ ...current, ...next }));
		setFieldErrors({});
		setError(null);
	};

	const checks = {
		vehicleNo: road ? vehicleError(draft.vehicleNo) : null,
		transporterId: road ? transporterIdError(draft.transporterId) : null,
		ewayBillNo: ewayEmpty ? ewayNoError(draft.ewayBillNo) : null,
		distanceKm: ewayEmpty ? distanceError(draft.distanceKm) : null,
	};
	const eway = normaliseEway(draft.ewayBillNo);

	function buildPayload(): DnTransportInput {
		const out: DnTransportInput = {};
		const text = (value: string) => (value.trim() === "" ? null : value.trim());
		if (road) {
			const vehicle = normaliseVehicle(draft.vehicleNo);
			if (vehicle !== normaliseVehicle(original.vehicleNo)) {
				out.vehicleNo = text(vehicle);
			}
			const tid = normaliseTransporterId(draft.transporterId);
			if (tid !== normaliseTransporterId(original.transporterId)) {
				out.transporterId = text(tid);
			}
		} else {
			if (draft.transportDocNo.trim() !== original.transportDocNo) {
				out.transportDocNo = text(draft.transportDocNo);
			}
			if (draft.transportDocDate !== original.transportDocDate) {
				out.transportDocDate = text(draft.transportDocDate);
			}
		}
		if (draft.transporterName.trim() !== original.transporterName) {
			out.transporterName = text(draft.transporterName);
		}
		// E-way no., date and distance go in together, once.
		if (ewayEmpty && eway !== "") {
			out.ewayBillNo = eway;
			out.ewayBillDate = text(draft.ewayBillDate);
			out.distanceKm =
				draft.distanceKm.trim() === "" ? null : Number(draft.distanceKm);
		}
		return out;
	}

	const payload = buildPayload();
	const changed = Object.keys(payload).length > 0;
	const ewayNeedsDate = ewayEmpty && eway !== "" && draft.ewayBillDate === "";
	const invalid =
		Object.values(checks).some(Boolean) || ewayNeedsDate || !changed;

	return (
		<Dialog open onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Update transport for {noteLabel(note)}</DialogTitle>
					<DialogDescription>
						The mode cannot change after posting. Every change is kept in the
						history.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-x-4 gap-y-1 sm:grid-cols-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (invalid) return;
						update.mutate(payload, {
							onSuccess: onClose,
							onError: (err) => {
								const message = dnErrorMessage(
									err,
									"Could not update the transport.",
								);
								if (
									err instanceof ApiClientError &&
									err.code === "DISPATCH_EWAY_REUSED"
								) {
									setFieldErrors({ ewayBillNo: message });
								} else {
									setError(message);
								}
							},
						});
					}}
				>
					{road ? (
						<>
							<DnField
								id="dn-tr-vehicle"
								label="Vehicle no."
								error={vehicleError(draft.vehicleNo)}
							>
								<Input
									id="dn-tr-vehicle"
									className="font-mono"
									value={draft.vehicleNo}
									maxLength={20}
									onChange={(event) => patch({ vehicleNo: event.target.value })}
									onBlur={() =>
										patch({ vehicleNo: normaliseVehicle(draft.vehicleNo) })
									}
								/>
							</DnField>
							<DnField
								id="dn-tr-tid"
								label="Transporter ID"
								error={transporterIdError(draft.transporterId)}
							>
								<Input
									id="dn-tr-tid"
									className="font-mono"
									value={draft.transporterId}
									maxLength={20}
									onChange={(event) =>
										patch({ transporterId: event.target.value })
									}
									onBlur={() =>
										patch({
											transporterId: normaliseTransporterId(
												draft.transporterId,
											),
										})
									}
								/>
							</DnField>
						</>
					) : (
						<>
							<DnField id="dn-tr-doc-no" label="Transport doc no.">
								<Input
									id="dn-tr-doc-no"
									value={draft.transportDocNo}
									maxLength={30}
									onChange={(event) =>
										patch({ transportDocNo: event.target.value })
									}
								/>
							</DnField>
							<DnField id="dn-tr-doc-date" label="Transport doc date">
								<Input
									id="dn-tr-doc-date"
									type="date"
									value={draft.transportDocDate}
									onChange={(event) =>
										patch({ transportDocDate: event.target.value })
									}
								/>
							</DnField>
						</>
					)}
					<DnField
						id="dn-tr-name"
						label="Transport name"
						className="sm:col-span-2"
					>
						<Input
							id="dn-tr-name"
							value={draft.transporterName}
							maxLength={100}
							onChange={(event) =>
								patch({ transporterName: event.target.value })
							}
						/>
					</DnField>
					{ewayEmpty ? (
						<>
							<DnField
								id="dn-tr-eway-no"
								label="E-way bill no."
								hint="Added once, with its date and distance"
								error={fieldErrors.ewayBillNo ?? checks.ewayBillNo}
							>
								<Input
									id="dn-tr-eway-no"
									className="font-mono"
									inputMode="numeric"
									value={draft.ewayBillNo}
									maxLength={14}
									onChange={(event) =>
										patch({ ewayBillNo: event.target.value })
									}
									onBlur={() =>
										patch({
											ewayBillNo: groupEway(eway).replace(/^–$/, ""),
										})
									}
								/>
							</DnField>
							<DnField
								id="dn-tr-eway-date"
								label="E-way bill date"
								error={ewayNeedsDate ? "Needed with the e-way bill no." : null}
							>
								<Input
									id="dn-tr-eway-date"
									type="date"
									value={draft.ewayBillDate}
									onChange={(event) =>
										patch({ ewayBillDate: event.target.value })
									}
								/>
							</DnField>
							<DnField
								id="dn-tr-distance"
								label="Distance km"
								error={checks.distanceKm}
							>
								<Input
									id="dn-tr-distance"
									className="text-right tabular-nums"
									inputMode="numeric"
									value={draft.distanceKm}
									onChange={(event) =>
										patch({ distanceKm: event.target.value })
									}
								/>
							</DnField>
						</>
					) : null}
					<div className="sm:col-span-2">
						<ErrorBox message={error} />
					</div>
					<DialogFooter className="sm:col-span-2">
						<Button
							type="button"
							variant="outline"
							disabled={update.isPending}
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={invalid || update.isPending}>
							{update.isPending ? "Saving…" : "Save transport"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
