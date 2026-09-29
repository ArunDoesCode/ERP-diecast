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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmPoMutation } from "@/lib/api/purchase-orders/queries";

const CONFIRMATION_METHOD_OPTIONS = [
	{ value: "phone", label: "Phone call" },
	{ value: "email", label: "Email" },
	{ value: "whatsapp", label: "WhatsApp" },
	{ value: "in_person", label: "In person" },
];

export function ConfirmPoDialog({
	poId,
	poNumber,
	open,
	onOpenChange,
	onConfirmed,
}: {
	poId: number;
	poNumber: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirmed: () => void;
}) {
	const [method, setMethod] = useState("phone");
	const [note, setNote] = useState("");
	const mutation = useConfirmPoMutation();

	const confirmationMethod = method;

	function reset() {
		setMethod("phone");
		setNote("");
	}

	function onSubmit() {
		if (!confirmationMethod) return;

		mutation.mutate(
			{
				poId,
				payload: {
					confirmationMethod,
					note: note.trim() || undefined,
				},
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						reset();
						onConfirmed();
					}
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) reset();
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>Confirm {poNumber} with supplier</DialogTitle>
					<DialogDescription>
						Informational only — this never blocks or changes the PO status.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 px-6 py-5">
					<div>
						<label
							htmlFor="po-confirm-method"
							className="mb-1 block text-xs font-medium"
						>
							Confirmation method
						</label>
						<Select value={method} onValueChange={setMethod}>
							<SelectTrigger id="po-confirm-method" className="w-full">
								<SelectValue placeholder="Select method" />
							</SelectTrigger>
							<SelectContent>
								{CONFIRMATION_METHOD_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div>
						<label
							htmlFor="po-confirm-note"
							className="mb-1 block text-xs font-medium"
						>
							Note
						</label>
						<Textarea
							id="po-confirm-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Optional"
						/>
					</div>
				</div>

				<DialogFooter className="border-t px-6 py-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={mutation.isPending || !confirmationMethod}
						onClick={onSubmit}
					>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
