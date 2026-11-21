"use client";

import { useState } from "react";

import { ErrorState } from "@/components/shared/ErrorState";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	bomErrorMessage,
	useBomWhereUsedQuery,
	useRetireBomMutation,
} from "@/lib/api/bom/queries";
import { BOM_REASON_MAX, BOM_REASON_MIN } from "@/types/bom";

export function RetireBomDialog({
	open,
	onOpenChange,
	bomId,
	partId,
	number,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bomId: number;
	partId: number;
	number: string;
}) {
	const affected = useBomWhereUsedQuery(
		partId,
		{ page: 1, pageSize: 100, sortBy: "partSku", sortDir: "asc" },
		open,
	);
	const mutation = useRetireBomMutation(bomId);
	const [reason, setReason] = useState("");
	const trimmed = reason.trim();
	const reasonValid =
		trimmed.length >= BOM_REASON_MIN && trimmed.length <= BOM_REASON_MAX;
	const loaded = affected.data !== undefined && !affected.isError;
	const canSubmit = loaded && reasonValid && !mutation.isPending;

	function close(next: boolean) {
		onOpenChange(next);
		if (!next) setReason("");
	}

	return (
		<AlertDialog open={open} onOpenChange={close}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Retire {number}?</AlertDialogTitle>
					<AlertDialogDescription>
						A retired BOM can no longer be used for needs. Start a new revision
						to replace it.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="max-h-[40vh] overflow-y-auto text-sm">
					{affected.isLoading ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					) : affected.isError ? (
						<ErrorState
							message={bomErrorMessage(
								affected.error,
								"The list of affected BOMs could not be loaded.",
							)}
							onRetry={() => {
								void affected.refetch();
							}}
							retrying={affected.isRefetching}
						/>
					) : (affected.data?.data.length ?? 0) === 0 ? (
						<p className="text-muted-foreground">
							No active BOM uses this part
						</p>
					) : (
						<>
							<p className="mb-1 font-medium">Active BOMs that use this part</p>
							<ul className="list-disc pl-5">
								{affected.data?.data.map((row) => (
									<li key={`${row.bomId}-${row.role}`}>
										<span className="font-mono">{row.number}</span>{" "}
										{row.partSku}
									</li>
								))}
							</ul>
						</>
					)}
				</div>

				<div className="min-h-19 space-y-1">
					<Label htmlFor="bom-retire-reason">Reason *</Label>
					<Textarea
						id="bom-retire-reason"
						value={reason}
						maxLength={BOM_REASON_MAX}
						onChange={(event) => setReason(event.target.value)}
					/>
					<p className="text-right text-[13px] text-muted-foreground tabular-nums">
						{reason.length} / {BOM_REASON_MAX}
					</p>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={!canSubmit}
						onClick={(event) => {
							event.preventDefault();
							mutation.mutate(
								{ reason: trimmed },
								{ onSuccess: () => close(false) },
							);
						}}
					>
						{mutation.isPending ? "Retiring…" : "Retire"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
