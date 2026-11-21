"use client";

import { useState } from "react";
import { transferQty } from "@/components/pages/stock-transfers/transfer-format";
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
	stErrorMessage,
	useCancelStockTransferMutation,
	usePostStockTransferMutation,
	useReverseStockTransferMutation,
} from "@/lib/api/stock-transfer/queries";
import { ST_REASON_MAX, type StDetail } from "@/types/stock-transfer";

export type TransferDialog = "post" | "cancel" | "reverse";

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

export function TransferActionDialogs({
	transfer,
	open,
	onClose,
}: {
	transfer: StDetail;
	open: TransferDialog | null;
	onClose: () => void;
}) {
	const post = usePostStockTransferMutation(transfer.id);
	const cancel = useCancelStockTransferMutation(transfer.id);
	const reverse = useReverseStockTransferMutation(transfer.id);
	const [error, setError] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();
	const reasonValid = trimmed.length >= 1 && trimmed.length <= ST_REASON_MAX;

	function close(next: boolean) {
		if (!next) {
			setError(null);
			setReason("");
			onClose();
		}
	}
	const fail = (fallback: string) => (err: unknown) =>
		setError(stErrorMessage(err, fallback));

	const lineCount = transfer.lines.length;
	const lineWord = lineCount === 1 ? "line" : "lines";

	return (
		<>
			<AlertDialog open={open === "post"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Post {transfer.transferNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							Move {lineCount} {lineWord} from {transfer.source.name} to{" "}
							{transfer.destination.name}?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
						{transfer.lines.map((line) => (
							<li key={line.lineId} className="flex justify-between gap-3">
								<span className="min-w-0 truncate">
									{line.sku} · {line.name}
								</span>
								<span className="shrink-0 tabular-nums">
									{transferQty(line.qty, line.unit)}
								</span>
							</li>
						))}
					</ul>
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
									onSuccess: () => close(false),
									onError: fail("Could not post the transfer."),
								});
							}}
						>
							{post.isPending ? "Posting…" : "Post transfer"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "cancel"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Cancel {transfer.transferNumber}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							It posts nothing and cannot be reopened.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ErrorBox message={open === "cancel" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={cancel.isPending}>
							Keep draft
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={cancel.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								cancel.mutate(undefined, {
									onSuccess: () => close(false),
									onError: fail("Could not cancel the transfer."),
								});
							}}
						>
							{cancel.isPending ? "Cancelling…" : "Cancel transfer"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={open === "reverse"} onOpenChange={close}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Reverse {transfer.transferNumber}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Moves the stock back at the same cost.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="st-reverse-reason">Reason *</Label>
						<Textarea
							id="st-reverse-reason"
							value={reason}
							maxLength={ST_REASON_MAX}
							onChange={(event) => setReason(event.target.value)}
						/>
						<p className="text-right text-[13px] text-muted-foreground tabular-nums">
							{reason.length} / {ST_REASON_MAX}
						</p>
					</div>
					<ErrorBox message={open === "reverse" ? error : null} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={reverse.isPending}>
							Keep transfer
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={!reasonValid || reverse.isPending}
							onClick={(event) => {
								event.preventDefault();
								setError(null);
								reverse.mutate(
									{ reason: trimmed },
									{
										onSuccess: () => close(false),
										onError: fail("Could not reverse the transfer."),
									},
								);
							}}
						>
							{reverse.isPending ? "Reversing…" : "Reverse transfer"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
