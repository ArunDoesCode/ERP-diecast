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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	useEscalatePoMutation,
	useMarkPoSentMutation,
	usePurchaseOrderDetailQuery,
	useSendPoReminderMutation,
} from "@/lib/api/purchase-orders/queries";
import {
	type PoCommunicationChannel,
	poCommunicationChannelValues,
} from "@/types/purchase-orders";

type LogPoCommunicationMode = "send" | "reminder" | "escalate";

const CHANNEL_LABEL: Record<PoCommunicationChannel, string> = {
	email: "Email",
	whatsapp: "WhatsApp",
	phone: "Phone",
	in_person: "In person",
};

const MODE_COPY: Record<
	LogPoCommunicationMode,
	{
		title: (poNumber: string) => string;
		description: string;
		submitLabel: string;
	}
> = {
	send: {
		title: (poNumber) => `Mark ${poNumber} as sent`,
		description:
			"Confirms dispatch to the supplier and logs how the PO was communicated.",
		submitLabel: "Mark as sent",
	},
	reminder: {
		title: (poNumber) => `Log reminder · ${poNumber}`,
		description: "Record that a delivery reminder was sent to the supplier.",
		submitLabel: "Log reminder",
	},
	escalate: {
		title: (poNumber) => `Log escalation · ${poNumber}`,
		description: "Record that this overdue PO was escalated with the supplier.",
		submitLabel: "Log escalation",
	},
};

export function LogPoCommunicationDialog({
	mode,
	poId,
	prId,
	poNumber,
	open,
	onOpenChange,
	onLogged,
}: {
	mode: LogPoCommunicationMode;
	poId: number;
	prId?: number;
	poNumber: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onLogged: () => void;
}) {
	const [channel, setChannel] = useState<PoCommunicationChannel>("email");
	const [note, setNote] = useState("");
	const [toEmail, setToEmail] = useState("");

	const sendMutation = useMarkPoSentMutation();
	const reminderMutation = useSendPoReminderMutation();
	const escalateMutation = useEscalatePoMutation();

	const mutation =
		mode === "send"
			? sendMutation
			: mode === "reminder"
				? reminderMutation
				: escalateMutation;

	const copy = MODE_COPY[mode];

	// BR-PO-18: expected delivery date is required before send.
	const detailQuery = usePurchaseOrderDetailQuery(
		poId,
		open && mode === "send",
	);
	const expectedDate = detailQuery.data?.success
		? detailQuery.data.data.po.expectedDeliveryDate
		: undefined;
	const missingExpectedDate =
		mode === "send" && detailQuery.data?.success === true && !expectedDate;

	function reset() {
		setChannel("email");
		setNote("");
		setToEmail("");
	}

	function onSubmit() {
		const payload = {
			channel,
			note: note.trim() || undefined,
			toEmail: channel === "email" ? toEmail.trim() || undefined : undefined,
		};

		if (mode === "send") {
			sendMutation.mutate(
				{ poId, prId, payload },
				{
					onSuccess: (result) => {
						if (result.success) {
							reset();
							onLogged();
						}
					},
				},
			);
			return;
		}

		if (mode === "reminder") {
			reminderMutation.mutate(
				{ poId, payload },
				{
					onSuccess: (result) => {
						if (result.success) {
							reset();
							onLogged();
						}
					},
				},
			);
			return;
		}

		escalateMutation.mutate(
			{ poId, payload },
			{
				onSuccess: (result) => {
					if (result.success) {
						reset();
						onLogged();
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
					<DialogTitle>{copy.title(poNumber)}</DialogTitle>
					<DialogDescription>{copy.description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 px-6 py-5">
					{missingExpectedDate ? (
						<p
							role="alert"
							className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
						>
							This PO has no expected delivery date, so it cannot be sent.
						</p>
					) : null}
					<div>
						<label
							htmlFor="po-log-communication-channel"
							className="mb-1 block text-xs font-medium"
						>
							Channel
						</label>
						<Select
							value={channel}
							onValueChange={(value) =>
								setChannel(value as PoCommunicationChannel)
							}
						>
							<SelectTrigger
								id="po-log-communication-channel"
								className="w-full"
							>
								<SelectValue placeholder="Select channel" />
							</SelectTrigger>
							<SelectContent>
								{poCommunicationChannelValues.map((value) => (
									<SelectItem key={value} value={value}>
										{CHANNEL_LABEL[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{channel === "email" ? (
						<div>
							<label
								htmlFor="po-log-communication-email"
								className="mb-1 block text-xs font-medium"
							>
								Supplier email
							</label>
							<Input
								id="po-log-communication-email"
								type="email"
								value={toEmail}
								onChange={(event) => setToEmail(event.target.value)}
								placeholder="supplier@example.com"
							/>
						</div>
					) : null}

					<div>
						<label
							htmlFor="po-log-communication-note"
							className="mb-1 block text-xs font-medium"
						>
							Note
						</label>
						<Textarea
							id="po-log-communication-note"
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
						disabled={
							mutation.isPending ||
							missingExpectedDate ||
							(channel === "email" && !toEmail.trim())
						}
						onClick={onSubmit}
					>
						{copy.submitLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
