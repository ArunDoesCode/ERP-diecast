"use client";

import { IconFileOff } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ExplosionTable } from "@/components/pages/sale-orders/ExplosionTable";
import {
	isPickable,
	type RowPick,
} from "@/components/pages/sale-orders/explosion-helpers";
import { DetailHeader } from "@/components/shared/DetailHeader";
import {
	DocumentFlow,
	type DocumentFlowStep,
} from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	soErrorMessage,
	useCreateSoDraftsMutation,
	useRunSoExplosionMutation,
	useSaleOrderQuery,
	useSoExplosionQuery,
	useSoExplosionRowsQuery,
	useSoExplosionsQuery,
} from "@/lib/api/sale-order/queries";
import { formatDateTime } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type {
	SoDraftPick,
	SoExplosionRow,
	SoOutOfDateReason,
} from "@/types/sale-order";

const REASON_TEXT: Record<SoOutOfDateReason, string> = {
	so_changed: "the order changed",
	bom_changed: "a BOM changed",
	delivery_changed: "a delivery changed",
};

export function ExplosionView({ soId, run }: { soId: number; run?: string }) {
	const router = useRouter();
	const canExplode = useCan("so.explode");
	const canPr = useCan("pr.manage");
	const canSco = useCan("sco.manage");
	const allowed = useMemo(
		() => ({ pr: canExplode && canPr, sco: canExplode && canSco }),
		[canExplode, canPr, canSco],
	);

	const soQuery = useSaleOrderQuery(soId);
	const so = soQuery.data?.data;
	const runsQuery = useSoExplosionsQuery(soId, {
		page: 1,
		pageSize: 100,
		sortBy: "runNo",
		sortDir: "desc",
	});
	const runs = useMemo(() => runsQuery.data?.data ?? [], [runsQuery.data]);
	const latest = runs[0];
	const selectedRun = useMemo(() => {
		const wanted = run?.match(/^E(\d+)$/i)?.[1];
		return (
			(wanted ? runs.find((r) => r.runNo === Number(wanted)) : undefined) ??
			latest
		);
	}, [run, runs, latest]);
	const eid = selectedRun?.id;

	const headerQuery = useSoExplosionQuery(soId, eid);
	const header = headerQuery.data?.data;
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);
	const rowsQuery = useSoExplosionRowsQuery(soId, eid, {
		page,
		pageSize,
		sortBy: "level",
		sortDir: "asc",
	});
	const rows = useMemo(() => rowsQuery.data?.data ?? [], [rowsQuery.data]);

	const rerun = useRunSoExplosionMutation(soId);
	const createDrafts = useCreateSoDraftsMutation(soId, eid ?? 0);
	const [picks, setPicks] = useState<Map<number, RowPick>>(new Map());
	const [serverError, setServerError] = useState<string | null>(null);
	const [pickError, setPickError] = useState<string | null>(null);

	useBreadcrumbLast(header?.number);

	const back = {
		backHref: `/sale-orders/${soId}`,
		backLabel: so?.soNumber ?? "sale order",
	};

	if (soQuery.isLoading || runsQuery.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-64" />
			</div>
		);
	}
	if (soQuery.isError || runsQuery.isError || !so) {
		const failed = soQuery.isError ? soQuery : runsQuery;
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<ErrorState
					message={soErrorMessage(failed.error, "Sale order not found")}
					onRetry={() => {
						void soQuery.refetch();
						void runsQuery.refetch();
					}}
					retrying={soQuery.isRefetching || runsQuery.isRefetching}
				/>
			</div>
		);
	}

	function reRun() {
		rerun.mutate(undefined, {
			onSuccess: () => {
				setPicks(new Map());
				setServerError(null);
				setPage(1);
				router.replace(`/sale-orders/${soId}/explosion`);
			},
		});
	}

	if (!selectedRun) {
		return (
			<div className="flex w-full flex-col gap-4">
				<DetailHeader
					docNo={so.soNumber}
					status={null}
					actions={
						canExplode && so.status === "confirmed" ? (
							<Button
								type="button"
								size="sm"
								disabled={rerun.isPending}
								onClick={reRun}
							>
								{rerun.isPending ? "Exploding…" : "Explode BOM"}
							</Button>
						) : undefined
					}
					{...back}
				/>
				<EmptyState icon={IconFileOff} title="Not exploded yet" />
			</div>
		);
	}

	const superseded = header?.status === "superseded";
	const outOfDate = header?.outOfDate === true && !superseded;
	const runOpen = header !== undefined && !superseded && !outOfDate;
	const rowsTotal = rowsQuery.data?.meta.total ?? 0;

	function toggleRow(row: SoExplosionRow, picked: boolean) {
		setPicks((current) => {
			const next = new Map(current);
			if (!picked) {
				next.delete(row.id);
				return next;
			}
			next.set(row.id, {
				qty: String(row.netQty),
				vendorId:
					row.jobWorker?.defaultVendorId ??
					(row.jobWorker?.candidates.length === 1
						? row.jobWorker.candidates[0].vendorId
						: undefined),
				returnDate: row.pastDue ? "" : row.requiredBy,
			});
			return next;
		});
	}

	function toggleAll(picked: boolean) {
		for (const row of rows) {
			if (!isPickable(row, allowed, runOpen)) continue;
			if (picked !== picks.has(row.id)) toggleRow(row, picked);
		}
	}

	function onCreate() {
		if (eid === undefined) return;
		setServerError(null);
		const payload: SoDraftPick[] = [];
		const knownRows = new Map(rows.map((row) => [row.id, row]));
		for (const [rowId, pick] of picks) {
			const row = knownRows.get(rowId);
			const qty = Number(pick.qty);
			const label = row?.sku ?? `row ${rowId}`;
			if (!Number.isFinite(qty) || qty <= 0) {
				setPickError(`${label}: enter a quantity above 0`);
				return;
			}
			if (row && qty > row.netQty) {
				setPickError(`${label}: quantity is more than the net need`);
				return;
			}
			if (row?.type === "job_work" && !pick.returnDate) {
				setPickError(`${label}: pick a return date`);
				return;
			}
			payload.push({
				rowId,
				qty,
				...(row?.type === "job_work"
					? {
							...(pick.vendorId ? { vendorId: pick.vendorId } : {}),
							expectedReturnDate: pick.returnDate,
						}
					: {}),
			});
		}
		setPickError(null);
		createDrafts.mutate(
			{ rows: payload },
			{
				onSuccess: (result) => {
					setPicks(new Map());
					toast.success("Drafts created", {
						description: (
							<span className="flex flex-wrap gap-2">
								{result.data.prs.map((pr) => (
									<Link
										key={`pr-${pr.id}`}
										href="/purchase-requisitions"
										className="font-mono underline"
									>
										{pr.prNumber}
									</Link>
								))}
								{result.data.scos.map((sco) => (
									<Link
										key={`sco-${sco.id}`}
										href={`/subcontracting/${sco.id}`}
										className="font-mono underline"
									>
										{sco.scoNumber}
									</Link>
								))}
							</span>
						),
					});
				},
				onError: (error) => {
					const message = soErrorMessage(error, "Could not create the drafts.");
					setServerError(message);
					toast.error(message);
				},
			},
		);
	}

	const steps: DocumentFlowStep[] = [
		{
			label: "Sale order",
			docNo: so.soNumber,
			href: `/sale-orders/${soId}`,
			status: <StatusBadge doc="so" status={so.status} />,
			state: "done",
		},
		{
			label: "Explosion",
			docNo: header?.number ?? selectedRun.number,
			status: header ? (
				<StatusBadge
					doc="soSnapshot"
					status={
						header.status === "superseded"
							? "superseded"
							: header.outOfDate
								? "out_of_date"
								: "current"
					}
				/>
			) : undefined,
			state: "current",
		},
	];
	for (const doc of so.raisedDocuments.filter(
		(d) => d.runNo === selectedRun.runNo,
	)) {
		steps.push({
			label: doc.type === "pr" ? `PR ${doc.number}` : `SCO ${doc.number}`,
			docNo: doc.number,
			href:
				doc.type === "sco"
					? `/subcontracting/${doc.id}`
					: "/purchase-requisitions",
			status: <StatusBadge doc={doc.type} status={doc.status} />,
			state: "done",
		});
	}

	const showCreate = canExplode && runOpen;
	const showRerun = canExplode && !superseded && so.status === "confirmed";
	const rerunPrimary = outOfDate;

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={header?.number ?? selectedRun.number}
				status={
					header ? (
						<StatusBadge
							doc="soSnapshot"
							status={
								superseded
									? "superseded"
									: outOfDate
										? "out_of_date"
										: "current"
							}
						/>
					) : undefined
				}
				loading={headerQuery.isLoading}
				meta={
					header
						? [
								{ label: "Customer", value: so.customerName },
								{
									label: "Run",
									value: `${header.createdByName} ${formatDateTime(header.createdAt)}`,
								},
								{
									label: "BOM revisions",
									value:
										header.bomRevisions.length === 0 ? (
											"–"
										) : (
											<details>
												<summary className="cursor-pointer">
													{header.bomRevisions.length} used
												</summary>
												<ul>
													{header.bomRevisions.map((rev) => (
														<li key={`${rev.partSku}-${rev.revision}`}>
															<span className="font-mono">{rev.partSku}</span>{" "}
															{rev.revision}
														</li>
													))}
												</ul>
											</details>
										),
								},
								{
									label: "Rows",
									value: `${header.totals.rowCount} (${header.totals.shortCount} short, ${header.totals.raisedCount} raised)`,
								},
							]
						: undefined
				}
				actions={
					<>
						{showCreate ? (
							<Button
								type="button"
								size="sm"
								disabled={picks.size === 0 || createDrafts.isPending}
								onClick={onCreate}
							>
								{createDrafts.isPending
									? "Creating…"
									: `Create drafts (${picks.size})`}
							</Button>
						) : null}
						{showRerun ? (
							<Button
								type="button"
								size="sm"
								variant={rerunPrimary ? "default" : "outline"}
								disabled={rerun.isPending}
								onClick={reRun}
							>
								{rerun.isPending ? "Exploding…" : "Re-run explosion"}
							</Button>
						) : null}
					</>
				}
				{...back}
			/>

			<DocumentFlow steps={steps} />

			{outOfDate ? (
				<output className="block rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
					Out of date. The order or a BOM changed after this run
					{header && header.outOfDateReasons.length > 0
						? ` (${header.outOfDateReasons.map((r) => REASON_TEXT[r]).join(", ")})`
						: ""}
					. Re-run to create drafts.
				</output>
			) : null}
			{superseded ? (
				<output className="block rounded-md bg-info-subtle px-3 py-2 text-sm text-info">
					Old run, read only.{" "}
					{latest && latest.id !== selectedRun.id ? (
						<Link
							href={`/sale-orders/${soId}/explosion`}
							className="text-brand-accent underline"
						>
							Open E{latest.runNo}
						</Link>
					) : null}
				</output>
			) : null}
			{pickError || serverError ? (
				<p
					role="alert"
					className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					{pickError ?? serverError}
				</p>
			) : null}

			<Card>
				<CardContent>
					{rowsQuery.isError ? (
						<ErrorState
							message={soErrorMessage(
								rowsQuery.error,
								"The explosion rows could not be loaded.",
							)}
							onRetry={() => {
								void rowsQuery.refetch();
							}}
							retrying={rowsQuery.isRefetching}
						/>
					) : !rowsQuery.isLoading && rowsTotal === 0 ? (
						<EmptyState
							title="Nothing to raise: stock and open supply cover this order."
							action={
								<Button type="button" size="sm" variant="outline" asChild>
									<Link href={`/sale-orders/${soId}`}>
										Back to {so.soNumber}
									</Link>
								</Button>
							}
						/>
					) : (
						<ExplosionTable
							rows={rows}
							loading={rowsQuery.isLoading}
							picks={picks}
							allowed={allowed}
							runOpen={runOpen}
							onToggle={toggleRow}
							onToggleAll={toggleAll}
							onChangePick={(rowId, patch) =>
								setPicks((current) => {
									const existing = current.get(rowId);
									if (!existing) return current;
									const next = new Map(current);
									next.set(rowId, { ...existing, ...patch });
									return next;
								})
							}
						/>
					)}
				</CardContent>
			</Card>

			<Pagination
				page={page}
				pageSize={pageSize}
				total={rowsTotal}
				onPageChange={setPage}
				onPageSizeChange={(next) => {
					setPageSize(next);
					setPage(1);
				}}
			/>
		</div>
	);
}
