"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActOnApprovalRequestMutation } from "@/lib/api/approval/queries";
import { useRefreshDocumentPanel } from "@/lib/api/document/queries";

export type ApprovalAct = "approve" | "sent_back" | "reject";

const COPY: Record<ApprovalAct, { verb: string; text: string }> = {
	approve: { verb: "Approve", text: "Your note goes on the approval trail." },
	sent_back: {
		verb: "Send back",
		text: "The requester gets the document back as a draft with your note.",
	},
	reject: {
		verb: "Reject",
		text: "Rejecting closes this request for good. The requester must start a new one.",
	},
};

/** Approve / Send back / Reject with the required note (BR-APR-37), for the current approver (BR-FF-44). */
export function DocApprovalActDialog({
	act,
	docNumber,
	requestId,
	onClose,
}: {
	act: ApprovalAct | null;
	docNumber: string;
	requestId: number;
	onClose: () => void;
}) {
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useActOnApprovalRequestMutation();
	const refreshPanel = useRefreshDocumentPanel();
	const queryClient = useQueryClient();
	const copy = act ? COPY[act] : null;

	function close() {
		setNote("");
		setError(null);
		onClose();
	}

	return (
		<Dialog
			open={act !== null}
			onOpenChange={(open) => {
				if (!open && !mutation.isPending) close();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{copy?.verb} {docNumber}?
					</DialogTitle>
					<DialogDescription>{copy?.text}</DialogDescription>
				</DialogHeader>
				<div className="space-y-1">
					<Label htmlFor="doc-approval-note">Note (required)</Label>
					<Textarea
						id="doc-approval-note"
						value={note}
						maxLength={1000}
						aria-invalid={error ? true : undefined}
						onChange={(event) => {
							setNote(event.target.value);
							setError(null);
						}}
					/>
					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={mutation.isPending}
						onClick={close}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant={act === "reject" ? "destructive" : "default"}
						disabled={mutation.isPending}
						onClick={() => {
							const typed = note.trim();
							if (!act) return;
							if (typed.length === 0) {
								setError("Type a note before you continue.");
								return;
							}
							mutation.mutate(
								{ id: requestId, input: { action: act, notes: typed } },
								{
									onSuccess: () => {
										void refreshPanel();
										void queryClient.invalidateQueries({
											queryKey: ["purchase-orders"],
										});
										close();
									},
								},
							);
						}}
					>
						{mutation.isPending ? "Saving…" : copy?.verb}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
