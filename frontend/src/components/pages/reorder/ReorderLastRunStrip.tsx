"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import Link from "next/link";

import { startedByText } from "@/components/pages/reorder/reorder-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCan } from "@/hooks/use-can";
import {
	useReorderRunsQuery,
	useReorderSettingsQuery,
} from "@/lib/api/reorder/queries";
import { formatDateTime } from "@/lib/format";

import { hourLabel } from "./reorder-format";

/** Muted text row under the page header: last check, daily-check setting, and the owner warning (A-37, BR-RO-15). */
export function ReorderLastRunStrip({
	onChooseOwner,
}: {
	onChooseOwner: () => void;
}) {
	const canManage = useCan("reorder.manage");
	const runs = useReorderRunsQuery({
		page: 1,
		pageSize: 1,
		sortBy: "startedAt",
		sortDir: "desc",
	});
	const settingsQuery = useReorderSettingsQuery();
	const run = runs.data?.data[0];
	const settings = settingsQuery.data?.data;

	return (
		<div className="flex flex-col gap-1">
			<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
				{runs.isLoading ? (
					<span>Loading last check…</span>
				) : run ? (
					<>
						<span>
							Last check {formatDateTime(run.startedAt)} · {startedByText(run)}{" "}
							·
						</span>
						<Link
							href={`/inventory/reorder/runs/${run.id}`}
							className="whitespace-nowrap text-brand-accent hover:underline"
						>
							Run <span className="font-mono">{run.id}</span>
						</Link>
						<StatusBadge doc="reorderRun" status={run.state} />
						{run.pr ? (
							<span className="font-mono">{run.pr.prNumber}</span>
						) : null}
					</>
				) : (
					<span>No check has run yet</span>
				)}
				<span aria-hidden="true">·</span>
				<Link
					href="/inventory/reorder/runs"
					className="text-brand-accent hover:underline"
				>
					Run history
				</Link>
			</p>
			{settings ? (
				<p className="text-sm text-muted-foreground">
					Daily check:{" "}
					{settings.enabled ? `On at ${hourLabel(settings.runHour)}` : "Off"}
				</p>
			) : null}
			{settings?.enabled && !settings.draftOwnerValid ? (
				<p
					role="alert"
					className="flex w-fit flex-wrap items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning"
				>
					<IconAlertTriangle size={16} aria-hidden="true" />
					<span>
						The draft owner can no longer raise requisitions – the next check
						will fail.
					</span>
					{canManage ? (
						<button
							type="button"
							onClick={onChooseOwner}
							className="font-semibold underline"
						>
							Choose a new owner
						</button>
					) : null}
				</p>
			) : null}
		</div>
	);
}
