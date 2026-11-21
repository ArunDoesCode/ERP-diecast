"use client";

import Link from "next/link";

import { CheckNowButton } from "@/components/pages/reorder/CheckNowButton";
import { ReorderRunFactsCard } from "@/components/pages/reorder/ReorderRunFactsCard";
import { ReorderRunItemsCard } from "@/components/pages/reorder/ReorderRunItemsCard";
import {
	runNo,
	startedByText,
} from "@/components/pages/reorder/reorder-format";
import { DetailHeader } from "@/components/shared/DetailHeader";
import {
	DocumentFlow,
	type DocumentFlowStep,
} from "@/components/shared/DocumentFlow";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	reorderErrorMessage,
	useReorderRunQuery,
} from "@/lib/api/reorder/queries";
import { formatDateTime } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { ReorderRunDetail } from "@/types/reorder";

function flowSteps(
	run: ReorderRunDetail,
	canOpenPr: boolean,
): DocumentFlowStep[] {
	if (!run.pr) return [];
	const steps: DocumentFlowStep[] = [
		{
			label: "Reorder run",
			docNo: runNo(run.id),
			status: <StatusBadge doc="reorderRun" status={run.state} />,
			state: "done",
		},
		{
			label: "Purchase requisition",
			docNo: run.pr.prNumber,
			href: canOpenPr ? `/purchase-requisitions/${run.pr.id}` : undefined,
			status: <StatusBadge doc="pr" status={run.pr.status} />,
			state: run.po ? "done" : "current",
		},
	];
	if (run.po) {
		steps.push({
			label: "Purchase order",
			docNo: run.po.poNumber,
			status: <StatusBadge doc="po" status={run.po.status} />,
			state: "current",
		});
	}
	return steps;
}

export function ReorderRunDetailView({ runId }: { runId: number }) {
	const canOpenPr = useCan("pr.manage");
	const canCheck = useCan("reorder.manage");
	const query = useReorderRunQuery(runId);
	const run = query.data?.data;
	useBreadcrumbLast(run ? runNo(run.id) : undefined);
	const back = {
		backHref: "/inventory/reorder/runs",
		backLabel: "reorder runs",
	};

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !run) {
		const notFound =
			query.error instanceof ApiClientError &&
			query.error.code === "REORDER_RUN_NOT_FOUND";
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<ErrorState
					message={
						notFound
							? "Run not found"
							: reorderErrorMessage(query.error, "The run could not be loaded.")
					}
					onRetry={
						notFound
							? undefined
							: () => {
									void query.refetch();
								}
					}
					retrying={query.isRefetching}
				/>
				{notFound ? (
					<Link
						href="/inventory/reorder/runs"
						className="text-sm text-brand-accent hover:underline"
					>
						Back to reorder runs
					</Link>
				) : null}
			</div>
		);
	}

	// One primary at most: Open PR when a PR was raised, Check now when nothing was raised or it failed.
	let primary: React.ReactNode = null;
	if (run.state === "done" && run.pr && canOpenPr) {
		primary = (
			<Button type="button" size="sm" asChild>
				<Link href={`/purchase-requisitions/${run.pr.id}`}>
					Open {run.pr.prNumber}
				</Link>
			</Button>
		);
	} else if (
		(run.state === "failed" || (run.state === "done" && !run.pr)) &&
		canCheck
	) {
		primary = <CheckNowButton />;
	}

	return (
		<div className="flex flex-col gap-4">
			<DetailHeader
				docNo={runNo(run.id)}
				status={<StatusBadge doc="reorderRun" status={run.state} />}
				meta={[
					{ label: "Started", value: formatDateTime(run.startedAt) },
					{ label: "Finished", value: formatDateTime(run.finishedAt) },
					{ label: "Started by", value: startedByText(run) },
				]}
				actions={primary}
				{...back}
			/>
			<DocumentFlow steps={flowSteps(run, canOpenPr)} />
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<ReorderRunItemsCard items={run.items} />
				<ReorderRunFactsCard run={run} canOpenPr={canOpenPr} />
			</div>
		</div>
	);
}
