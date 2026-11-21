"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/client";
import {
	customerErrorMessage,
	useCreateCustomerMutation,
	useUpdateCustomerMutation,
} from "@/lib/api/customers/queries";
import {
	CUSTOMER_ADDRESS_MAX,
	CUSTOMER_NAME_MAX,
	type Customer,
	GST_STATES,
	GSTIN_PATTERN,
	stateLabel,
} from "@/types/customer";

function Field({
	id,
	label,
	hint,
	error,
	className,
	children,
}: {
	id: string;
	label: string;
	hint?: string;
	error?: string | null;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={`min-h-19 space-y-1 ${className ?? ""}`}>
			<Label htmlFor={id}>{label}</Label>
			{children}
			{error ? (
				<p className="text-[13px] text-destructive">{error}</p>
			) : hint ? (
				<p className="text-[13px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

type Errors = Partial<
	Record<"name" | "stateCode" | "gstin" | "address" | "form", string>
>;

export function CustomerForm({ existing }: { existing?: Customer }) {
	const router = useRouter();
	const createMutation = useCreateCustomerMutation();
	const updateMutation = useUpdateCustomerMutation(existing?.id ?? 0);
	const isPending = createMutation.isPending || updateMutation.isPending;

	const [name, setName] = useState(existing?.name ?? "");
	const [stateCode, setStateCode] = useState(existing?.stateCode ?? "");
	const [gstin, setGstin] = useState(existing?.gstin ?? "");
	const [address, setAddress] = useState(existing?.address ?? "");
	const [isActive, setIsActive] = useState(existing?.isActive ?? true);
	const [errors, setErrors] = useState<Errors>({});

	function validate(): Errors {
		const next: Errors = {};
		if (!name.trim()) next.name = "Enter the customer name";
		if (!stateCode) next.stateCode = "Pick the state";
		if (!address.trim()) next.address = "Enter the address";
		const g = gstin.trim().toUpperCase();
		if (g) {
			if (!GSTIN_PATTERN.test(g))
				next.gstin = "Enter a valid 15-character GSTIN";
			else if (stateCode && g.slice(0, 2) !== stateCode)
				next.gstin = "The first two digits must match the state";
		}
		return next;
	}

	function onError(error: unknown) {
		if (error instanceof ApiClientError) {
			if (error.code === "CUSTOMER_NAME_EXISTS") {
				setErrors({ name: error.message });
				return;
			}
			if (error.status === 400 && gstin.trim()) {
				setErrors({ gstin: error.message });
				return;
			}
		}
		setErrors({
			form: customerErrorMessage(error, "Could not save the customer."),
		});
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		const g = gstin.trim().toUpperCase();
		if (existing) {
			updateMutation.mutate(
				{
					name: name.trim(),
					stateCode,
					address: address.trim(),
					gstin: g || null,
					isActive,
				},
				{ onSuccess: () => router.push("/customers"), onError },
			);
			return;
		}
		createMutation.mutate(
			{
				name: name.trim(),
				stateCode,
				address: address.trim(),
				...(g ? { gstin: g } : {}),
			},
			{ onSuccess: () => router.push("/customers"), onError },
		);
	}

	return (
		<form onSubmit={onSubmit} className="flex w-full max-w-4xl flex-col gap-4">
			<PageHeader title={existing ? `Edit ${existing.name}` : "Add customer"} />

			{errors.form ? (
				<p
					role="alert"
					className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					{errors.form}
				</p>
			) : null}

			<div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
				<Field id="customer-name" label="Name *" error={errors.name}>
					<Input
						id="customer-name"
						value={name}
						maxLength={CUSTOMER_NAME_MAX}
						onChange={(event) => setName(event.target.value)}
					/>
				</Field>
				<Field id="customer-state" label="State *" error={errors.stateCode}>
					<Select value={stateCode} onValueChange={setStateCode}>
						<SelectTrigger id="customer-state" className="w-full">
							<SelectValue placeholder="Pick a state" />
						</SelectTrigger>
						<SelectContent>
							{GST_STATES.map((state) => (
								<SelectItem key={state.code} value={state.code}>
									{stateLabel(state)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field
					id="customer-gstin"
					label="GSTIN"
					hint="First two digits must match the state"
					error={errors.gstin}
				>
					<Input
						id="customer-gstin"
						className="font-mono uppercase"
						value={gstin}
						maxLength={15}
						onChange={(event) => setGstin(event.target.value.toUpperCase())}
					/>
				</Field>
				<Field id="customer-address" label="Address *" error={errors.address}>
					<Textarea
						id="customer-address"
						value={address}
						maxLength={CUSTOMER_ADDRESS_MAX}
						onChange={(event) => setAddress(event.target.value)}
					/>
				</Field>
				{existing ? (
					<div className="flex min-h-19 items-center gap-2">
						<Switch
							id="customer-active"
							checked={isActive}
							onCheckedChange={setIsActive}
						/>
						<Label htmlFor="customer-active">Active</Label>
					</div>
				) : null}
			</div>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={() => router.push("/customers")}
				>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={isPending}>
					{isPending ? "Saving…" : "Save customer"}
				</Button>
			</div>
		</form>
	);
}
