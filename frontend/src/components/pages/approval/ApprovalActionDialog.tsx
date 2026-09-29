"use client";

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
import type { ApprovalRequestAction } from "@/types/approval";

export type InboxAction = Extract<
	ApprovalRequestAction,
	"approve" | "reject" | "sent_back" | "withdraw"
>;

const COPY: Record<InboxAction, { title: string; confirm: string }> = {
	approve: { title: "Approve request", confirm: "Approve" },
	reject: { title: "Reject request", confirm: "Reject" },
	sent_back: { title: "Send back for changes", confirm: "Send back" },
	withdraw: { title: "Withdraw request", confirm: "Withdraw" },
};

type ApprovalActionDialogProps = {
	action: InboxAction | null;
	docNumber: string;
	isPending: boolean;
	onConfirm: (notes: string) => void;
	onClose: () => void;
};

/** BR-APR-37: approve / reject / send back need a typed comment. Withdraw's is optional (BR-APR-39). */
export function ApprovalActionDialog({
	action,
	docNumber,
	isPending,
	onConfirm,
	onClose,
}: ApprovalActionDialogProps) {
	const [notes, setNotes] = useState("");
	const required = action !== "withdraw";
	const trimmed = notes.trim();
	const invalid = required && trimmed.length === 0;

	function close() {
		setNotes("");
		onClose();
	}

	return (
		<Dialog
			open={action !== null}
			onOpenChange={(open) => {
				if (!open && !isPending) close();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{action ? COPY[action].title : ""}</DialogTitle>
					<DialogDescription>{docNumber}</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="approval-action-notes">
						{required ? "Comment (required)" : "Comment (optional)"}
					</Label>
					<Textarea
						id="approval-action-notes"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder="Type your comment"
						maxLength={1000}
					/>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={close}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant={action === "reject" ? "destructive" : "default"}
						disabled={invalid || isPending}
						onClick={() => onConfirm(trimmed)}
					>
						{action ? COPY[action].confirm : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
