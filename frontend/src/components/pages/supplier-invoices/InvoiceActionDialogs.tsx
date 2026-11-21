"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { describeMismatch } from "@/components/pages/supplier-invoices/invoice-format";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	sinvErrorMessage,
	useBackToDraftMutation,
	useCancelSupplierInvoiceMutation,
	useDeleteSupplierInvoiceMutation,
	useReleaseSupplierInvoiceMutation,
	useSubmitSupplierInvoiceMutation,
} from "@/lib/api/supplier-invoice/queries";
import {
	SINV_CANCEL_REASON_MIN_APPROVED,
	SINV_CANCEL_REASON_MIN_BLOCKED,
	SINV_REASON_MAX,
	SINV_RELEASE_REASON_MIN,
	type SinvDetail,
} from "@/types/supplier-invoice";

export type InvoiceDialog =
	| "submit"
	| "backToDraft"
	| "release"
	| "cancel"
	| "delete";

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

function ReasonField({
	id,
	value,
	min,
	onChange,
}: {
	id: string;
	value: string;
	min: number;
	onChange: (value: string) => void;
}) {
	const trimmed = value.trim().length;
	const tooShort = value !== "" && trimmed < min;
	return (
		<div className="min-h-19 space-y-1">
			<Label htmlFor={id}>Reason *</Label>
			<Textarea
				id={id}
				value={value}
				maxLength={SINV_REASON_MAX}
				aria-invalid={tooShort ? true : undefined}
				onChange={(event) => onChange(event.target.value)}
			/>
			<div className="flex justify-between gap-2 text-[13px]">
				<span
					className={tooShort ? "text-destructive" : "text-muted-foreground"}
				>
					{min} to {SINV_REASON_MAX} characters
				</span>
				<span className="text-muted-foreground tabular-nums">
					{value.length} / {SINV_REASON_MAX}
				</span>
			</div>
		</div>
	);
}

export function InvoiceActionDialogs({
	inv,
	open,
	onClose,
}: {
	inv: SinvDetail;
	open: InvoiceDialog | null;
	onClose: () => void;
}) {
	const router = useRouter();
	const submit = useSubmitSupplierInvoiceMutation();
	const backToDraft = useBackToDraftMutation(inv.id);
	const release = useReleaseSupplierInvoiceMutation(inv.id);
	const cancel = useCancelSupplierInvoiceMutation(inv.id);
	const remove = useDeleteSupplierInvoiceMutation(inv.id);
	const [error, setError] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();

	const cancelMin =
		inv.status === "approved"
			? SINV_CANCEL_REASON_MIN_APPROVED
			: SINV_CANCEL_REASON_MIN_BLOCKED;
	const releaseValid =
		trimmed.length >= SINV_RELEASE_REASON_MIN &&
		trimmed.length <= SINV_REASON_MAX;
	const cancelValid =
		trimmed.length >= cancelMin && trimmed.length <= SINV_REASON_MAX;

	function close(next: boolean) {
		if (!next) {
			setError(null);
			setReason("");
			onClose();
		}
	}
	const fail = (fallback: string) => (err: unknown) =>
		setError(sinvErrorMessage(err, fallback));

	return (
		<>
			<AlertDialog open={open === "submit"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Submit {inv.ourNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							The match runs now. A bill that passes is Payable; one that fails
							is saved as Blocked and waits for a release.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "submit" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={submit.isPending}>
							Keep draft
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={submit.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								submit.mutate(inv.id, {
									onSuccess: () => close(false),
									onError: fail("Could not submit the invoice."),
								});
							}}
						>
							{submit.isPending ? "Submitting…" : "Submit invoice"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "backToDraft"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Send {inv.ourNumber} back to draft?
						</AlertDialogTitle>
						<AlertDialogDescription>
							The match result is cleared. You can edit the bill and submit it
							again.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "backToDraft" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={backToDraft.isPending}>
							Keep blocked
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={backToDraft.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								backToDraft.mutate(undefined, {
									onSuccess: () => close(false),
									onError: fail("Could not move it back to draft."),
								});
							}}
						>
							{backToDraft.isPending ? "Moving…" : "Back to draft"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "release"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Release {inv.ourNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							{inv.mismatches.length > 0
								? "This bill is blocked for:"
								: "This bill is blocked."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{inv.mismatches.length > 0 ? (
						<ul className="list-disc space-y-1 pl-5 text-sm">
							{inv.mismatches.map((mismatch, index) => (
								<li
									key={`${mismatch.check}-${mismatch.lineId ?? "x"}-${mismatch.head ?? "x"}-${index}`}
								>
									{describeMismatch(mismatch, inv)}
								</li>
							))}
						</ul>
					) : null}
					<ReasonField
						id="sinv-release-reason"
						value={reason}
						min={SINV_RELEASE_REASON_MIN}
						onChange={setReason}
					/>
					<ErrorBox message={open === "release" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={release.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={!releaseValid || release.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								release.mutate(
									{ reason: trimmed },
									{
										onSuccess: () => close(false),
										onError: fail("Could not release the invoice."),
									},
								);
							}}
						>
							{release.isPending ? "Releasing…" : "Release invoice"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "cancel"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancel {inv.ourNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							Its quantity becomes billable again. The number stays and cannot
							be reused.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ReasonField
						id="sinv-cancel-reason"
						value={reason}
						min={cancelMin}
						onChange={setReason}
					/>
					<ErrorBox message={open === "cancel" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={cancel.isPending}>
							Keep invoice
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={!cancelValid || cancel.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								cancel.mutate(
									{ reason: trimmed },
									{
										onSuccess: () => close(false),
										onError: fail("Could not cancel the invoice."),
									},
								);
							}}
						>
							{cancel.isPending ? "Cancelling…" : "Cancel invoice"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "delete"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete draft {inv.ourNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							The draft is deleted for good and its quantity is free to bill
							again. The number is not reused.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "delete" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={remove.isPending}>
							Keep draft
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								remove.mutate(undefined, {
									onSuccess: () => {
										close(false);
										router.push("/supplier-invoices");
									},
									onError: fail("Could not delete the draft."),
								});
							}}
						>
							{remove.isPending ? "Deleting…" : "Delete draft"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
