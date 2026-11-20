"use client";

import { ErrorState } from "@/components/shared/ErrorState";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessLogDetailQuery } from "@/lib/api/setup/queries";
import { formatDateTime } from "@/lib/format";

type AccessLogDetailDialogProps = {
	id: number | null;
	onClose: () => void;
};

function formatRecord(value: unknown) {
	return value === null || value === undefined
		? "–"
		: JSON.stringify(value, null, 2);
}

function RecordBlock({ label, value }: { label: string; value: unknown }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
				{label}
			</span>
			<pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-all">
				{formatRecord(value)}
			</pre>
		</div>
	);
}

/** One access-log row: summary plus the full before → after (BR-AUTH-31). */
export function AccessLogDetailDialog({
	id,
	onClose,
}: AccessLogDetailDialogProps) {
	const detailQuery = useAccessLogDetailQuery(id);
	const entry = detailQuery.data?.data;

	return (
		<Dialog
			open={id !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
				showCloseButton
			>
				<DialogHeader>
					<DialogTitle>Access change</DialogTitle>
					<DialogDescription>
						{entry
							? `${entry.actorName ?? "System"} · ${formatDateTime(entry.at)} · ${entry.action} · ${entry.target}`
							: "Loading the change…"}
					</DialogDescription>
				</DialogHeader>

				{detailQuery.isError ? (
					<ErrorState
						message="This change could not be loaded."
						onRetry={() => detailQuery.refetch()}
						retrying={detailQuery.isFetching}
					/>
				) : !entry ? (
					<div aria-busy="true" className="grid gap-3 sm:grid-cols-2">
						<Skeleton className="h-40" />
						<Skeleton className="h-40" />
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<p className="text-sm">{entry.summary}</p>
						<div className="grid gap-3 sm:grid-cols-2">
							<RecordBlock label="Before" value={entry.before} />
							<RecordBlock label="After" value={entry.after} />
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
