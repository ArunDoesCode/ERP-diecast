"use client";

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

/** Confirm Deactivate / Activate; names the customer (BR-SO-02). */
export function CustomerActiveDialog({
	open,
	onOpenChange,
	name,
	activate,
	isPending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	activate: boolean;
	isPending: boolean;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{activate ? `Activate ${name}?` : `Deactivate ${name}?`}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{activate
							? "The customer can be picked on new sale orders again."
							: "The customer can no longer be picked on new sale orders. Existing orders are not changed."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant={activate ? "default" : "destructive"}
						disabled={isPending}
						onClick={(event) => {
							event.preventDefault();
							onConfirm();
						}}
					>
						{isPending
							? activate
								? "Activating…"
								: "Deactivating…"
							: activate
								? "Activate"
								: "Deactivate"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
