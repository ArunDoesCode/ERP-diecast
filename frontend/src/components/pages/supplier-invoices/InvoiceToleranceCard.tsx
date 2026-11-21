"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	sinvErrorMessage,
	useInvoiceTolerancesQuery,
	useSaveInvoiceTolerancesMutation,
} from "@/lib/api/supplier-invoice/queries";
import type { InvoiceTolerances } from "@/types/supplier-invoice";

const MAX_PERCENT = 10;

/** 0 to 10 with at most 2 decimals; null when it is not. */
function parsePercent(text: string): number | null {
	const clean = text.trim();
	if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
	const value = Number(clean);
	return value >= 0 && value <= MAX_PERCENT ? value : null;
}

const RANGE_ERROR = `Enter 0 to ${MAX_PERCENT}, up to 2 decimals`;

function ToleranceForm({
	values,
	canEdit,
}: {
	values: InvoiceTolerances;
	canEdit: boolean;
}) {
	const mutation = useSaveInvoiceTolerancesMutation();
	const [price, setPrice] = useState(String(values.priceTolerancePercent));
	const [weight, setWeight] = useState(String(values.weightTolerancePercent));
	const [showErrors, setShowErrors] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	const priceValue = parsePercent(price);
	const weightValue = parsePercent(weight);

	function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setShowErrors(true);
		setServerError(null);
		if (priceValue === null || weightValue === null) return;
		mutation.mutate(
			{
				priceTolerancePercent: priceValue,
				weightTolerancePercent: weightValue,
			},
			{
				onError: (error) =>
					setServerError(
						error instanceof ApiClientError &&
							error.code === "SINV_COMPANY_NOT_SET"
							? "Save company details first."
							: sinvErrorMessage(error, "Could not save the tolerances."),
					),
			},
		);
	}

	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-4">
			{serverError ? (
				<div
					role="alert"
					className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					{serverError}
				</div>
			) : null}
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="min-h-19 space-y-1">
					<Label htmlFor="tol-price">Price tolerance %</Label>
					<Input
						id="tol-price"
						inputMode="decimal"
						value={price}
						disabled={!canEdit || mutation.isPending}
						aria-invalid={showErrors && priceValue === null ? true : undefined}
						className="text-right tabular-nums"
						onChange={(event) => setPrice(event.target.value)}
					/>
					{showErrors && priceValue === null ? (
						<p className="text-[13px] text-destructive">{RANGE_ERROR}</p>
					) : null}
				</div>
				<div className="min-h-19 space-y-1">
					<Label htmlFor="tol-weight">Weight tolerance %</Label>
					<Input
						id="tol-weight"
						inputMode="decimal"
						value={weight}
						disabled={!canEdit || mutation.isPending}
						aria-invalid={showErrors && weightValue === null ? true : undefined}
						className="text-right tabular-nums"
						onChange={(event) => setWeight(event.target.value)}
					/>
					{showErrors && weightValue === null ? (
						<p className="text-[13px] text-destructive">{RANGE_ERROR}</p>
					) : null}
				</div>
			</div>
			<p className="text-[13px] text-muted-foreground">
				Billing above this blocks the invoice. Pieces always match exactly. A
				change applies to the next submit only.
			</p>
			{canEdit ? (
				<div className="flex justify-end">
					<Button type="submit" disabled={mutation.isPending}>
						{mutation.isPending ? "Saving…" : "Save"}
					</Button>
				</div>
			) : null}
		</form>
	);
}

/** Card "Invoice matching" on the company settings page (BR-SINV-32). Read-only without `company.manage`. */
export function InvoiceToleranceCard() {
	const canView = useCan("invoice.view");
	const canEdit = useCan("company.manage");
	const query = useInvoiceTolerancesQuery(canView || canEdit);
	if (!canView && !canEdit) return null;
	const data = query.data?.data;
	return (
		<Card className="max-w-xl">
			<CardHeader>
				<CardTitle>Invoice matching</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<Skeleton className="h-24" />
				) : query.isError || !data ? (
					<div className="flex flex-col items-start gap-2 text-sm">
						<p className="text-destructive">
							{sinvErrorMessage(
								query.error,
								"The tolerances could not be loaded.",
							)}
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								void query.refetch();
							}}
						>
							Try again
						</Button>
					</div>
				) : (
					<ToleranceForm
						key={`${data.priceTolerancePercent}-${data.weightTolerancePercent}`}
						values={data}
						canEdit={canEdit}
					/>
				)}
			</CardContent>
		</Card>
	);
}
