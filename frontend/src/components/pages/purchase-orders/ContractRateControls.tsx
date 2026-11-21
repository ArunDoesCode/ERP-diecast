"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCan } from "@/hooks/use-can";
import { useContractQuery } from "@/lib/api/rate-contract/queries";
import { formatQtyTrim } from "@/lib/format";

export const OVERRIDE_REASON_MIN = 3;
export const OVERRIDE_REASON_MAX = 500;

export function overrideReasonValid(reason: string) {
	const length = reason.trim().length;
	return length >= OVERRIDE_REASON_MIN && length <= OVERRIDE_REASON_MAX;
}

/**
 * The "Contract" badge, the fixed-rate note and, for holders of `contract.override_rate`,
 * the "Override rate" switch with its required reason (BR-RFQ-50, 51).
 */
export function ContractRateControls({
	idPrefix,
	contractNumber,
	qtyLeft,
	unit,
	contractId,
	itemId,
	canOverride,
	overriding,
	onOverridingChange,
	reason,
	onReasonChange,
	showReasonError,
}: {
	idPrefix: string;
	contractNumber?: string | null;
	/** Contract quantity still open (from the last-rate answer). */
	qtyLeft?: number | string | null;
	/** Unit of the line, shown after the quantities. */
	unit?: string | null;
	/** With `itemId`: lets the note show the contract cap (needs contract.view). */
	contractId?: number;
	itemId?: number;
	canOverride: boolean;
	overriding: boolean;
	onOverridingChange: (on: boolean) => void;
	reason: string;
	onReasonChange: (reason: string) => void;
	showReasonError: boolean;
}) {
	const canViewContract = useCan("contract.view");
	const contractQuery = useContractQuery(
		canViewContract && qtyLeft != null && qtyLeft !== ""
			? contractId
			: undefined,
	);
	const cap =
		contractQuery.data?.data.lines.find((line) => line.itemId === itemId)
			?.capQty ?? null;
	const label = contractNumber ? `Contract ${contractNumber}` : "Contract";
	const reasonId = `${idPrefix}-override-reason`;
	const reasonError =
		showReasonError && overriding && !overrideReasonValid(reason);
	return (
		<div className="space-y-2 md:col-span-full">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<Badge
					variant="outline"
					className="border-border bg-success-subtle text-success"
				>
					{label}
				</Badge>
				{qtyLeft != null && qtyLeft !== "" ? (
					<span className="text-muted-foreground tabular-nums">
						Qty left {formatQtyTrim(qtyLeft, unit)}
						{cap != null ? ` of ${formatQtyTrim(cap, unit)}` : ""}
					</span>
				) : null}
				{overriding ? (
					<>
						<span className="text-muted-foreground">
							Rate changed from the contract.
						</span>
						<Button
							type="button"
							variant="link"
							size="sm"
							className="h-auto px-0 underline"
							onClick={() => {
								onOverridingChange(false);
								onReasonChange("");
							}}
						>
							Use contract rate
						</Button>
					</>
				) : (
					<>
						<span className="text-muted-foreground">
							{contractNumber
								? `Fixed by contract ${contractNumber}`
								: "Rate and GST are fixed by the contract"}
						</span>
						{canOverride ? (
							<Button
								type="button"
								variant="link"
								size="sm"
								className="h-auto px-0 text-brand-accent underline"
								onClick={() => onOverridingChange(true)}
							>
								Override rate
							</Button>
						) : null}
					</>
				)}
			</div>
			{overriding ? (
				<div className="min-h-19 max-w-md space-y-1">
					<Label htmlFor={reasonId}>Reason *</Label>
					<Input
						id={reasonId}
						value={reason}
						maxLength={OVERRIDE_REASON_MAX}
						aria-invalid={reasonError ? true : undefined}
						onChange={(event) => onReasonChange(event.target.value)}
					/>
					<p
						className={
							reasonError
								? "text-[13px] text-destructive"
								: "text-[13px] text-muted-foreground"
						}
					>
						{OVERRIDE_REASON_MIN} to {OVERRIDE_REASON_MAX} characters
					</p>
				</div>
			) : null}
		</div>
	);
}
