"use client";

import { useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useClosePoMutation } from "@/lib/api/purchase-orders/queries";

export function ClosePoAlert({
	poId,
	poNumber,
	onClosed,
	open,
	onOpenChange,
}: {
	poId: number;
	poNumber: string;
	onClosed?: () => void;
	/** Controlled mode (opened from a menu): no trigger button is rendered. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [note, setNote] = useState("");
	const mutation = useClosePoMutation();

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange?.(next);
				if (!next) setNote("");
			}}
		>
			{open === undefined ? (
				<AlertDialogTrigger asChild>
					<Button type="button" size="sm" variant="outline">
						Close PO
					</Button>
				</AlertDialogTrigger>
			) : null}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Close {poNumber}?</AlertDialogTitle>
					<AlertDialogDescription>
						This is terminal — the PO cannot be reopened or transitioned further
						after closing.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Textarea
					value={note}
					onChange={(event) => setNote(event.target.value)}
					placeholder="Note (optional)"
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Back</AlertDialogCancel>
					<AlertDialogAction
						disabled={mutation.isPending}
						onClick={() =>
							mutation.mutate(
								{ poId, payload: { note: note.trim() || undefined } },
								{
									onSuccess: (result) => {
										if (result.success) onClosed?.();
									},
								},
							)
						}
					>
						Close PO
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
