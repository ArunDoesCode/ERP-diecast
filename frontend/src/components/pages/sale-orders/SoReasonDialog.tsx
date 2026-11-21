"use client";

import { useState } from "react";

import {
	detailDocNumbers,
	errorDetails,
} from "@/components/pages/sale-orders/so-format";
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
	type SoReasonAction,
	soErrorMessage,
	useSoReasonMutation,
} from "@/lib/api/sale-order/queries";
import { SO_REASON_MAX, SO_REASON_MIN } from "@/types/sale-order";

const COPY: Record<
	SoReasonAction,
	{
		title: (no: string) => string;
		description: string;
		confirm: string;
		pending: string;
		keep: string;
		destructive: boolean;
	}
> = {
	hold: {
		title: (no) => `Hold ${no}?`,
		description: "The order stays visible but is paused until you resume it.",
		confirm: "Hold order",
		pending: "Holding…",
		keep: "Keep order",
		destructive: false,
	},
	close: {
		title: (no) => `Close ${no}?`,
		description: "A closed order takes no more changes or deliveries.",
		confirm: "Close order",
		pending: "Closing…",
		keep: "Keep order",
		destructive: false,
	},
	cancel: {
		title: (no) => `Cancel ${no}?`,
		description:
			"The order is cancelled for good. If it has deliveries, close it instead.",
		confirm: "Cancel sale order",
		pending: "Cancelling…",
		keep: "Keep order",
		destructive: true,
	},
};

/** Hold / Close / Cancel: names the SO, needs a 3 to 500 character reason (BR-SO-16..18). */
export function SoReasonDialog({
	open,
	onOpenChange,
	action,
	soId,
	soNumber,
	editVersion,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	action: SoReasonAction;
	soId: number;
	soNumber: string;
	editVersion: number;
}) {
	const copy = COPY[action];
	const mutation = useSoReasonMutation(soId, action);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<{
		message: string;
		numbers: string[];
	} | null>(null);
	const trimmed = reason.trim();
	const valid =
		trimmed.length >= SO_REASON_MIN && trimmed.length <= SO_REASON_MAX;
	const fieldId = `so-${action}-reason`;

	function close(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setReason("");
			setError(null);
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={close}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{copy.title(soNumber)}</AlertDialogTitle>
					<AlertDialogDescription>{copy.description}</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="min-h-19 space-y-1">
					<Label htmlFor={fieldId}>Reason *</Label>
					<Textarea
						id={fieldId}
						value={reason}
						maxLength={SO_REASON_MAX}
						onChange={(event) => setReason(event.target.value)}
					/>
					<p className="text-right text-[13px] text-muted-foreground tabular-nums">
						{reason.length} / {SO_REASON_MAX}
					</p>
				</div>

				{error ? (
					<div
						role="alert"
						className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
					>
						<p>{error.message}</p>
						{error.numbers.length > 0 ? (
							<p className="font-mono">{error.numbers.join(", ")}</p>
						) : null}
					</div>
				) : null}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={mutation.isPending}>
						{copy.keep}
					</AlertDialogCancel>
					<AlertDialogAction
						variant={copy.destructive ? "destructive" : "default"}
						disabled={!valid || mutation.isPending}
						onClick={(event) => {
							event.preventDefault();
							setError(null);
							mutation.mutate(
								{ reason: trimmed, editVersion },
								{
									onSuccess: () => close(false),
									onError: (err) =>
										setError({
											message: soErrorMessage(err, "Could not complete this."),
											numbers: detailDocNumbers(errorDetails(err)),
										}),
								},
							);
						}}
					>
						{mutation.isPending ? copy.pending : copy.confirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
