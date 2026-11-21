"use client";

import { type ReactNode, useEffect, useState } from "react";

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

export const REASON_MIN = 3;
export const REASON_MAX = 500;

export function DialogError({ message }: { message: string | null }) {
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

/** Confirm dialog naming the document, optionally with a required reason box (3 to 500). */
export function ReasonDialog({
	open,
	onOpenChange,
	title,
	description,
	keepLabel = "Keep",
	actionLabel,
	pendingLabel,
	pending,
	error,
	destructive = true,
	withReason = true,
	children,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	keepLabel?: string;
	actionLabel: string;
	pendingLabel: string;
	pending: boolean;
	error: string | null;
	destructive?: boolean;
	withReason?: boolean;
	children?: ReactNode;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	useEffect(() => {
		if (!open) setReason("");
	}, [open]);
	const trimmed = reason.trim();
	const tooShort = reason !== "" && trimmed.length < REASON_MIN;
	const valid =
		!withReason ||
		(trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{children}
				{withReason ? (
					<div className="min-h-19 space-y-1">
						<Label htmlFor="reason-dialog-reason">Reason *</Label>
						<Textarea
							id="reason-dialog-reason"
							value={reason}
							maxLength={REASON_MAX}
							aria-invalid={tooShort ? true : undefined}
							onChange={(event) => setReason(event.target.value)}
						/>
						<div className="flex justify-between gap-2 text-[13px]">
							<span
								className={
									tooShort ? "text-destructive" : "text-muted-foreground"
								}
							>
								{REASON_MIN} to {REASON_MAX} characters
							</span>
							<span className="text-muted-foreground tabular-nums">
								{reason.length} / {REASON_MAX}
							</span>
						</div>
					</div>
				) : null}
				<DialogError message={error} />
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>{keepLabel}</AlertDialogCancel>
					<AlertDialogAction
						variant={destructive ? "destructive" : "default"}
						disabled={!valid || pending}
						onClick={(event) => {
							event.preventDefault();
							onConfirm(trimmed);
						}}
					>
						{pending ? pendingLabel : actionLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
