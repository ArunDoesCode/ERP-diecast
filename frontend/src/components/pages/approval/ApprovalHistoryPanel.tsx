"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApprovalHistoryQuery } from "@/lib/api/approval/queries";
import type { ApprovalDocType } from "@/types/approval";

const ACTION_LABEL: Record<string, string> = {
	submitted: "Submitted",
	approved: "Approved",
	rejected: "Rejected",
	require_more_info: "Sent back",
	auto_approved: "Auto-approved",
	// Used for both withdraw and document cancel; the note says which.
	cancelled: "Cancelled",
	withdrawn: "Withdrawn",
};

const STATUS_LABEL: Record<string, string> = {
	pending_approval: "Waiting for approval",
	approved: "Approved",
	rejected: "Rejected",
	require_more_info: "Sent back",
	auto_approved: "Auto-approved",
	cancelled: "Cancelled",
	partial_ordered: "Partly ordered",
	fully_ordered: "Fully ordered",
};

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

/** BR-APR-54: every approval request of a document, newest first, with its trail. */
export function ApprovalHistoryPanel({
	docType,
	docId,
	enabled = true,
}: {
	docType: ApprovalDocType;
	docId: number;
	enabled?: boolean;
}) {
	const query = useApprovalHistoryQuery(docType, docId, enabled);
	const history = query.data?.success ? query.data.data : [];

	return (
		<section className="space-y-2" aria-label="Approval history">
			<h3 className="text-sm font-medium">Approval history</h3>
			{query.isLoading ? (
				<Skeleton className="h-10 w-full" />
			) : query.isError ? (
				<p className="text-xs text-destructive">
					Could not load approval history.
				</p>
			) : history.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Not submitted for approval yet.
				</p>
			) : (
				<ul className="space-y-3">
					{history.map((request, index) => (
						<li key={request.id} className="rounded-md border p-3 text-xs">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline">
									{STATUS_LABEL[request.status] ?? request.status}
								</Badge>
								<span className="text-muted-foreground">
									Requested {formatDate(request.requestedAt)}
								</span>
								{index === 0 && request.status === "pending_approval" ? (
									<span>
										Level {request.currentLevel} of {request.totalLevels}
										{request.currentApproverRole
											? ` · waiting for ${request.currentApproverRole}`
											: request.currentApproverEmployeeId
												? ` · waiting for employee #${request.currentApproverEmployeeId}`
												: ""}
									</span>
								) : null}
							</div>
							<ol className="mt-2 space-y-1 border-l pl-3">
								{request.trail.map((entry) => (
									<li key={entry.id}>
										<span className="font-medium">
											{ACTION_LABEL[entry.action] ?? entry.action}
										</span>{" "}
										by {entry.actorName} · {formatDate(entry.actionAt)}
										{entry.notes ? (
											<p className="text-muted-foreground">“{entry.notes}”</p>
										) : null}
									</li>
								))}
							</ol>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
