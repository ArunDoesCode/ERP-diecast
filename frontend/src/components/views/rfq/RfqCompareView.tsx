"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { CompareBlock } from "@/components/pages/rfq/CompareBlock";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReasonDialog } from "@/components/shared/ReasonDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	rfqErrorMessage,
	useAwardRfqMutation,
	useComparisonQuery,
	useRfqQuery,
} from "@/lib/api/rfq/queries";
import { formatDateTime } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { RFQ_REASON_MAX, RFQ_REASON_MIN } from "@/types/rfq";

/** Comparison and award: one block per line, one row per supplier (screens.md 5). */
export function RfqCompareView({ rfqId }: { rfqId: number }) {
	const router = useRouter();
	const canView = useCan("rfq.view");
	const canAward = useCan("rfq.award");
	const canPo = useCan("po.manage");
	const canManage = useCan("rfq.manage");
	const comparison = useComparisonQuery(canView ? rfqId : undefined);
	const details = useRfqQuery(canView ? rfqId : undefined);
	const award = useAwardRfqMutation(rfqId);
	const cmp = comparison.data?.data;
	const rfq = details.data?.data;
	useBreadcrumbLast(cmp?.rfq.rfqNumber);

	const [picks, setPicks] = useState<Map<number, number>>(new Map());
	const [reasons, setReasons] = useState<Map<number, string>>(new Map());
	const [showErrors, setShowErrors] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onPick = useCallback((rfqItemId: number, quoteItemId: number) => {
		setPicks((current) => new Map(current).set(rfqItemId, quoteItemId));
	}, []);
	const onReason = useCallback((rfqItemId: number, reason: string) => {
		setReasons((current) => new Map(current).set(rfqItemId, reason));
	}, []);

	const supplierNames = useMemo(() => {
		const names = new Map<number, string>();
		for (const s of cmp?.suppliers ?? []) {
			const id = s.supplierId ?? s.id;
			const name = s.name ?? s.supplierName;
			if (id !== undefined && name) names.set(id, name);
		}
		for (const s of rfq?.suppliers ?? []) names.set(s.supplierId, s.name);
		return names;
	}, [cmp?.suppliers, rfq?.suppliers]);
	const linesById = useMemo(
		() => new Map((rfq?.lines ?? []).map((l) => [l.id, l])),
		[rfq?.lines],
	);

	if (!canView) {
		return <NoAccessState what="requests for quotation" />;
	}
	if (comparison.isLoading || details.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Compare quotes" />
				<Skeleton className="h-56" />
				<Skeleton className="h-56" />
			</div>
		);
	}
	if (comparison.isError || !cmp || details.isError || !rfq) {
		const failure = comparison.error ?? details.error;
		const notFound =
			failure instanceof ApiClientError && failure.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Compare quotes" />
				{notFound ? (
					<EmptyState title="RFQ not found" />
				) : (
					<ErrorState
						message={rfqErrorMessage(
							failure,
							"The comparison could not be loaded.",
						)}
						onRetry={() => {
							void comparison.refetch();
							void details.refetch();
						}}
						retrying={comparison.isRefetching}
					/>
				)}
			</div>
		);
	}

	const status = cmp.rfq.status;
	const rfqOpen = status === "sent" || status === "partially_awarded";
	const canPick = canAward && canPo && rfqOpen;
	const hasSubmitted = cmp.rows.some((row) =>
		row.cells.some((c) => c.state !== "no_quote" && c.quoteId !== null),
	);
	const openRows = cmp.rows.filter(
		(row) => row.lineStatus === "open" && !row.prLineCancelled,
	);
	const activePicks = openRows.flatMap((row) => {
		const quoteItemId = picks.get(row.rfqItemId);
		const cell = row.cells.find((c) => c.quoteItemId === quoteItemId);
		return quoteItemId !== undefined && cell
			? [{ row, cell, quoteItemId }]
			: [];
	});
	const bySupplier = new Map<number, number>();
	for (const { cell } of activePicks) {
		bySupplier.set(cell.supplierId, (bySupplier.get(cell.supplierId) ?? 0) + 1);
	}
	const awardedCount = cmp.rows.filter(
		(r) => r.lineStatus === "awarded",
	).length;

	function reasonOk(rfqItemId: number, isLowest: boolean) {
		if (isLowest) return true;
		const text = (reasons.get(rfqItemId) ?? "").trim();
		return text.length >= RFQ_REASON_MIN && text.length <= RFQ_REASON_MAX;
	}

	function onAwardClick() {
		setShowErrors(true);
		setError(null);
		if (
			activePicks.every(({ row, cell }) =>
				reasonOk(row.rfqItemId, cell.isLowest),
			)
		) {
			setConfirm(true);
		}
	}

	function doAward() {
		setError(null);
		award.mutate(
			{
				lines: activePicks.map(({ row, cell, quoteItemId }) => ({
					rfqItemId: row.rfqItemId,
					quoteItemId,
					reason: cell.isLowest
						? undefined
						: (reasons.get(row.rfqItemId) ?? "").trim(),
				})),
			},
			{
				onSuccess: (result) => {
					setConfirm(false);
					toast.success("Award done. Draft POs created", {
						description: (
							<span className="flex flex-col">
								{result.data.pos.map((po) => (
									<Link
										key={po.poId}
										href={`/purchase-orders/${po.poId}`}
										className="font-mono text-brand-accent underline"
									>
										{po.poNumber}
									</Link>
								))}
							</span>
						),
					});
					router.push(`/rfq/${rfqId}`);
				},
				onError: (err) => {
					setConfirm(false);
					const line =
						err instanceof ApiClientError && err.code === "RFQ_LINE_AWARDED"
							? "Someone awarded this line."
							: null;
					setError(
						line ?? rfqErrorMessage(err, "The award failed. Nothing changed."),
					);
				},
			},
		);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title={`Compare · ${cmp.rfq.rfqNumber}`}
				description="Pick the winning quote for each line; one draft PO is made per supplier."
				actions={
					<>
						<StatusBadge doc="rfq" status={status} />
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href={`/rfq/${rfqId}`}>Back to RFQ</Link>
						</Button>
					</>
				}
			/>

			{!hasSubmitted ? (
				<EmptyState
					title="No submitted quotes yet"
					action={
						canManage && rfqOpen ? (
							<Button type="button" size="sm" variant="outline" asChild>
								<Link href={`/rfq/${rfqId}/quotes/new`}>Enter quote</Link>
							</Button>
						) : undefined
					}
				/>
			) : (
				cmp.rows.map((row) => (
					<CompareBlock
						key={row.rfqItemId}
						row={row}
						line={linesById.get(row.rfqItemId)}
						supplierNames={supplierNames}
						canPick={canPick}
						pickedQuoteItemId={picks.get(row.rfqItemId)}
						reason={reasons.get(row.rfqItemId) ?? ""}
						showReasonError={showErrors}
						onPick={onPick}
						onReason={onReason}
					/>
				))
			)}

			{cmp.cancelledQuotes.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Cancelled quotes</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="space-y-1 text-sm text-muted-foreground">
							{cmp.cancelledQuotes.map((q) => (
								<li key={q.quoteId}>
									<span className="font-mono">{q.quoteNumber}</span>{" "}
									{supplierNames.get(q.supplierId) ?? ""}: cancelled by{" "}
									{q.cancelledByName ?? "–"}, {formatDateTime(q.cancelledAt)}
									{q.cancelReason ? `: ${q.cancelReason}` : ""}
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}

			{error ? (
				<div
					role="alert"
					className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					{error}
				</div>
			) : null}

			{hasSubmitted ? (
				<div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
					<p className="text-sm">
						{canPick
							? `${activePicks.length} of ${openRows.length} lines picked${
									bySupplier.size > 0
										? ` · ${bySupplier.size} draft PO${bySupplier.size === 1 ? "" : "s"}: ${[
												...bySupplier,
											]
												.map(
													([id, n]) =>
														`${supplierNames.get(id) ?? `Supplier #${id}`} (${n} line${n === 1 ? "" : "s"})`,
												)
												.join(", ")}`
										: ""
								}`
							: `${awardedCount} of ${cmp.rows.length} lines awarded`}
					</p>
					{canPick ? (
						<Button
							type="button"
							disabled={activePicks.length === 0 || award.isPending}
							onClick={onAwardClick}
						>
							Award → PO
						</Button>
					) : null}
				</div>
			) : null}

			<ReasonDialog
				open={confirm}
				onOpenChange={setConfirm}
				title="Award and make draft POs?"
				description="Each supplier gets one draft PO. Awarded lines can't be changed here."
				keepLabel="Keep comparing"
				actionLabel="Award → PO"
				pendingLabel="Awarding…"
				destructive={false}
				withReason={false}
				pending={award.isPending}
				error={null}
				onConfirm={doAward}
			>
				<ul className="list-disc space-y-1 pl-5 text-sm">
					{[...bySupplier].map(([id, n]) => (
						<li key={id}>
							{supplierNames.get(id) ?? `Supplier #${id}`}: {n} line
							{n === 1 ? "" : "s"}
						</li>
					))}
					{activePicks
						.filter(({ cell }) => !cell.isLowest)
						.map(({ row }) => (
							<li key={`r-${row.rfqItemId}`} className="text-muted-foreground">
								{row.itemCode} not the lowest:{" "}
								{(reasons.get(row.rfqItemId) ?? "").trim()}
							</li>
						))}
				</ul>
			</ReasonDialog>
		</div>
	);
}
