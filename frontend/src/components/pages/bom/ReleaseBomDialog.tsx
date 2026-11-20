"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorState } from "@/components/shared/ErrorState";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	bomErrorMessage,
	bomKeys,
	useBomChangeSummaryQuery,
	useReleaseBomMutation,
} from "@/lib/api/bom/queries";
import { ApiClientError } from "@/lib/api/client";
import {
	BOM_REASON_MAX,
	BOM_REASON_MIN,
	type BomChangeSummary,
	type BomProblem,
} from "@/types/bom";

const FIELD_LABELS: Record<string, { label: string; suffix?: string }> = {
	kind: { label: "Kind" },
	alloyItemId: { label: "Alloy" },
	netWeightKg: { label: "Net weight", suffix: " kg" },
	shotWeightKg: { label: "Shot weight", suffix: " kg" },
	cavities: { label: "Cavities" },
	meltLossPct: { label: "Melt loss", suffix: " %" },
	castingRejectPct: { label: "Casting reject", suffix: " %" },
	sentItemId: { label: "Sent item" },
	sendQty: { label: "Send qty" },
	returnQty: { label: "Return qty" },
	jobWorkerId: { label: "Job worker" },
	serviceId: { label: "Service" },
	jobWorkLossPct: { label: "Loss", suffix: " %" },
};

function valueText(value: unknown, suffix = "") {
	if (value === null || value === undefined || value === "") return "–";
	return `${String(value)}${suffix}`;
}

function SummaryBody({
	summary,
	itemNames,
}: {
	summary: BomChangeSummary;
	itemNames: ReadonlyMap<number, string>;
}) {
	const name = (id: number) => itemNames.get(id) ?? `Item #${id}`;
	const { added, removed, changed } = summary.lines;
	const nothing =
		summary.header.length === 0 &&
		added.length === 0 &&
		removed.length === 0 &&
		changed.length === 0;
	return (
		<div className="flex flex-col gap-3 text-sm">
			{summary.firstRevision ? (
				<p className="text-muted-foreground">
					First revision, nothing to compare
				</p>
			) : (
				<p className="text-muted-foreground">
					Changes against rev {summary.against?.revision} (active, will be
					retired)
				</p>
			)}
			{!summary.firstRevision && nothing ? (
				<p>No changes against rev {summary.against?.revision}</p>
			) : null}
			{summary.header.length > 0 ? (
				<div>
					<p className="font-medium">Header</p>
					<ul className="list-disc pl-5">
						{summary.header.map((change) => {
							const meta = FIELD_LABELS[change.field];
							return (
								<li key={change.field}>
									{meta?.label ?? change.field}{" "}
									{valueText(change.old, meta?.suffix)} {"→"}{" "}
									{valueText(change.new, meta?.suffix)}
								</li>
							);
						})}
					</ul>
				</div>
			) : null}
			{added.length + removed.length + changed.length > 0 ? (
				<div>
					<p className="font-medium">Lines</p>
					<ul className="list-disc pl-5 tabular-nums">
						{added.map((line) => (
							<li key={`a-${line.componentItemId}`}>
								Added {name(line.componentItemId)} qty {line.qtyPerPiece}
								{line.buyAsIs ? " (buy as is)" : ""}
							</li>
						))}
						{removed.map((line) => (
							<li key={`r-${line.componentItemId}`}>
								Removed {name(line.componentItemId)} qty {line.qtyPerPiece}
							</li>
						))}
						{changed.map((line) => (
							<li key={`c-${line.componentItemId}`}>
								Changed {name(line.componentItemId)} qty {line.qtyOld} {"→"}{" "}
								{line.qtyNew}
								{line.buyAsIsOld !== line.buyAsIsNew
									? `, buy as is ${line.buyAsIsOld ? "yes" : "no"} → ${line.buyAsIsNew ? "yes" : "no"}`
									: ""}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

function ProblemList({ problems }: { problems: BomProblem[] }) {
	if (problems.length === 0) return null;
	return (
		<ul role="alert" className="list-disc pl-5 text-sm text-destructive">
			{problems.map((problem) => (
				<li key={`${problem.code}-${problem.field ?? ""}-${problem.message}`}>
					{problem.message}
				</li>
			))}
		</ul>
	);
}

export function ReleaseBomDialog({
	open,
	onOpenChange,
	bomId,
	number,
	partSku,
	itemNames,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bomId: number;
	number: string;
	partSku: string;
	itemNames: ReadonlyMap<number, string>;
}) {
	const queryClient = useQueryClient();
	const summaryQuery = useBomChangeSummaryQuery(bomId, open);
	const mutation = useReleaseBomMutation(bomId);
	const [reason, setReason] = useState("");
	const [serverProblems, setServerProblems] = useState<BomProblem[]>([]);
	const [conflict, setConflict] = useState<string | null>(null);

	const summary = summaryQuery.data?.data;
	const trimmed = reason.trim();
	const reasonRequired = summary ? !summary.firstRevision : true;
	const reasonValid =
		trimmed.length >= BOM_REASON_MIN && trimmed.length <= BOM_REASON_MAX;
	const canSubmit =
		summary?.canRelease === true &&
		conflict === null &&
		(!reasonRequired || reasonValid) &&
		!mutation.isPending;

	function close(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setReason("");
			setServerProblems([]);
			setConflict(null);
			mutation.reset();
		}
	}

	function reload() {
		setConflict(null);
		void queryClient.invalidateQueries({ queryKey: bomKeys.all });
	}

	function onRelease() {
		if (!summary) return;
		setServerProblems([]);
		mutation.mutate(
			{ version: summary.version, ...(trimmed ? { reason: trimmed } : {}) },
			{
				onSuccess: () => close(false),
				onError: (error) => {
					if (error instanceof ApiClientError) {
						if (error.code === "BOM_RELEASE_INVALID") {
							const details = (
								error.body as { details?: { problems?: BomProblem[] } } | null
							)?.details;
							setServerProblems(
								details?.problems ?? [
									{ code: error.code, message: error.message },
								],
							);
							return;
						}
						if (
							error.code === "BOM_NOT_DRAFT" ||
							error.code === "BOM_RELEASE_CONFLICT" ||
							error.code === "BOM_CHANGED_SINCE_REVIEW"
						) {
							setConflict(`${partSku} changed meanwhile, reload`);
							return;
						}
					}
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Release {number}</DialogTitle>
					<DialogDescription>
						Check what changes, give the reason, then make this revision live.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[60vh] overflow-y-auto">
					{summaryQuery.isLoading ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					) : summaryQuery.isError ? (
						<ErrorState
							message={bomErrorMessage(
								summaryQuery.error,
								"The change summary could not be loaded.",
							)}
							onRetry={() => {
								void summaryQuery.refetch();
							}}
							retrying={summaryQuery.isRefetching}
						/>
					) : summary ? (
						<div className="flex flex-col gap-3">
							<SummaryBody summary={summary} itemNames={itemNames} />
							<ProblemList problems={summary.problems} />
						</div>
					) : null}
				</div>

				<ProblemList problems={serverProblems} />
				{conflict ? (
					<div role="alert" className="flex items-center gap-3 text-sm">
						<span className="text-destructive">{conflict}</span>
						<Button type="button" size="sm" variant="outline" onClick={reload}>
							Reload
						</Button>
					</div>
				) : null}

				<div className="min-h-19 space-y-1">
					<Label htmlFor="bom-release-reason">
						Change reason{reasonRequired ? " *" : ""}
					</Label>
					<Textarea
						id="bom-release-reason"
						value={reason}
						maxLength={BOM_REASON_MAX}
						onChange={(event) => setReason(event.target.value)}
					/>
					<p className="text-right text-[13px] text-muted-foreground tabular-nums">
						{reason.length} / {BOM_REASON_MAX}
					</p>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => close(false)}>
						Cancel
					</Button>
					<Button type="button" disabled={!canSubmit} onClick={onRelease}>
						{mutation.isPending ? "Releasing…" : `Release ${number}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
