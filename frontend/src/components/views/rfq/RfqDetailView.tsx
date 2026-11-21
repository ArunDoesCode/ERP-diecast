"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import {
	type QuoteAction,
	RfqLinesCard,
	RfqQuotesCard,
	RfqSidePane,
} from "@/components/pages/rfq/RfqDetailCards";
import { DetailHeader } from "@/components/shared/DetailHeader";
import {
	DocumentFlow,
	type DocumentFlowStep,
} from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReasonDialog } from "@/components/shared/ReasonDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	rfqErrorMessage,
	useCancelQuoteMutation,
	useCancelRfqMutation,
	useCloseRfqMutation,
	useRfqQuery,
	useSendRfqMutation,
	useSubmitQuoteMutation,
} from "@/lib/api/rfq/queries";
import { formatDate } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { QuoteHeader, RfqDetails } from "@/types/rfq";

type Dialog =
	| { kind: "send" | "close" | "cancel" }
	| { kind: "quote-submit" | "quote-cancel"; quote: QuoteHeader };

function flowSteps(data: RfqDetails): DocumentFlowStep[] {
	const steps: DocumentFlowStep[] = [];
	const prs = new Map(data.lines.map((l) => [l.prId, l.prNumber] as const));
	for (const [prId, prNumber] of prs) {
		steps.push({
			label: "Purchase requisition",
			docNo: prNumber,
			href: `/purchase-requisitions/${prId}`,
			state: "done",
		});
	}
	steps.push({
		label: "RFQ",
		docNo: data.rfq.rfqNumber,
		status: <StatusBadge doc="rfq" status={data.rfq.status} />,
		state: "current",
	});
	const pos = new Map(
		data.lines
			.filter((l) => l.poId && l.poNumber)
			.map((l) => [l.poId, l] as const),
	);
	for (const line of pos.values()) {
		steps.push({
			label: "Purchase order",
			docNo: line.poNumber ?? undefined,
			href: `/purchase-orders/${line.poId}`,
			status: line.poStatus ? (
				<StatusBadge doc="po" status={line.poStatus} />
			) : undefined,
			state: "done",
		});
	}
	return steps;
}

export function RfqDetailView({ rfqId }: { rfqId: number }) {
	const canView = useCan("rfq.view");
	const canManage = useCan("rfq.manage");
	const canAward = useCan("rfq.award");
	const query = useRfqQuery(canView ? rfqId : undefined);
	const data = query.data?.data;
	useBreadcrumbLast(data?.rfq.rfqNumber);

	const send = useSendRfqMutation(rfqId);
	const close = useCloseRfqMutation(rfqId);
	const cancel = useCancelRfqMutation(rfqId);
	const submitQuote = useSubmitQuoteMutation();
	const cancelQuote = useCancelQuoteMutation();
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [error, setError] = useState<string | null>(null);

	const back = { backHref: "/rfq", backLabel: "RFQs" };

	if (!canView) {
		return <NoAccessState what="requests for quotation" />;
	}
	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
					<Skeleton className="h-64" />
					<Skeleton className="h-64" />
				</div>
			</div>
		);
	}
	if (query.isError || !data) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader
					title="RFQ not found"
					actions={
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href={back.backHref}>Back to RFQs</Link>
						</Button>
					}
				/>
				{notFound ? (
					<EmptyState title="It may have been deleted, or the link is wrong" />
				) : (
					<ErrorState
						message={rfqErrorMessage(
							query.error,
							"The RFQ could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				)}
			</div>
		);
	}

	const { rfq } = data;
	const isDraft = rfq.status === "draft";
	const isOpen = rfq.status === "sent" || rfq.status === "partially_awarded";
	const hasAward = data.lines.some((l) => l.lineStatus === "awarded");
	const canCancelRfq = canManage && (isDraft || isOpen) && !hasAward;
	const canCloseRfq = canManage && isOpen;
	const showMore = canManage && (isDraft || canCloseRfq || canCancelRfq);
	const sentOnward = !isDraft;

	function close_() {
		setDialog(null);
		setError(null);
	}
	const fail = (fallback: string) => (err: unknown) =>
		setError(rfqErrorMessage(err, fallback));

	const actions = (
		<>
			{sentOnward ? (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href={`/rfq/${rfq.id}/compare`}>Compare</Link>
				</Button>
			) : null}
			{sentOnward && rfq.status !== "cancelled" ? (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href={`/rfq/${rfq.id}/print`}>Print sheets</Link>
				</Button>
			) : null}
			{showMore ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm" variant="outline">
							<IconDots />
							More
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{isDraft ? (
							<DropdownMenuItem asChild>
								<Link href={`/rfq/${rfq.id}/edit`}>Edit</Link>
							</DropdownMenuItem>
						) : null}
						{canCloseRfq ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog({ kind: "close" })}
							>
								Close RFQ
							</DropdownMenuItem>
						) : null}
						{canCancelRfq ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog({ kind: "cancel" })}
							>
								Cancel RFQ
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</>
	);

	const quoteDialog = dialog && "quote" in dialog ? dialog.quote : null;

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			<DetailHeader
				docNo={rfq.rfqNumber}
				status={<StatusBadge doc="rfq" status={rfq.status} />}
				meta={[
					{ label: "Due", value: formatDate(rfq.dueDate) },
					{ label: "Created by", value: rfq.createdByName ?? "–" },
					{
						label: "Suppliers",
						value: `${data.suppliers.length}`,
					},
				]}
				actions={actions}
				{...back}
			/>
			<DocumentFlow steps={flowSteps(data)} />
			{rfq.status === "cancelled" || rfq.status === "closed" ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					{rfq.status === "cancelled" ? "Cancelled" : "Closed"}
					{rfq.cancelReason || rfq.closeReason
						? `: ${rfq.cancelReason ?? rfq.closeReason}`
						: ""}
				</output>
			) : null}

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="flex min-w-0 flex-col gap-4">
					<RfqLinesCard data={data} />
					<RfqQuotesCard
						data={data}
						canManage={canManage}
						canCancelSubmitted={!isOpen || canAward}
						onAction={(action: QuoteAction, quote) =>
							setDialog({
								kind: action === "submit" ? "quote-submit" : "quote-cancel",
								quote,
							})
						}
					/>
				</div>
				<RfqSidePane
					data={data}
					canManage={canManage}
					onSend={() => setDialog({ kind: "send" })}
				/>
			</div>

			<ReasonDialog
				open={dialog?.kind === "send"}
				onOpenChange={(open) => !open && close_()}
				title={`Send ${rfq.rfqNumber}?`}
				description="Locks lines and suppliers; nothing is e-mailed."
				keepLabel="Keep draft"
				actionLabel="Send RFQ"
				pendingLabel="Sending…"
				destructive={false}
				withReason={false}
				pending={send.isPending}
				error={dialog?.kind === "send" ? error : null}
				onConfirm={() => {
					setError(null);
					send.mutate(undefined, {
						onSuccess: close_,
						onError: fail("Could not send the RFQ."),
					});
				}}
			/>
			<ReasonDialog
				open={dialog?.kind === "close"}
				onOpenChange={(open) => !open && close_()}
				title={`Close ${rfq.rfqNumber}?`}
				description="No more quotes can be entered. Lines not awarded are dropped and can go on a new RFQ."
				actionLabel="Close RFQ"
				pendingLabel="Closing…"
				pending={close.isPending}
				error={dialog?.kind === "close" ? error : null}
				onConfirm={(reason) => {
					setError(null);
					close.mutate(
						{ reason },
						{ onSuccess: close_, onError: fail("Could not close the RFQ.") },
					);
				}}
			/>
			<ReasonDialog
				open={dialog?.kind === "cancel"}
				onOpenChange={(open) => !open && close_()}
				title={`Cancel ${rfq.rfqNumber}?`}
				description="The lines go back to the requisition queue. The number cannot be reused."
				actionLabel="Cancel RFQ"
				pendingLabel="Cancelling…"
				pending={cancel.isPending}
				error={dialog?.kind === "cancel" ? error : null}
				onConfirm={(reason) => {
					setError(null);
					cancel.mutate(
						{ reason },
						{ onSuccess: close_, onError: fail("Could not cancel the RFQ.") },
					);
				}}
			/>
			<ReasonDialog
				open={dialog?.kind === "quote-submit"}
				onOpenChange={(open) => !open && close_()}
				title={`Submit quote from ${quoteDialog?.supplierName ?? ""}?`}
				description="A submitted quote can't be edited. A change means cancel and enter a new one."
				keepLabel="Keep draft"
				actionLabel="Submit quote"
				pendingLabel="Submitting…"
				destructive={false}
				withReason={false}
				pending={submitQuote.isPending}
				error={dialog?.kind === "quote-submit" ? error : null}
				onConfirm={() => {
					if (!quoteDialog) return;
					setError(null);
					submitQuote.mutate(quoteDialog.id, {
						onSuccess: close_,
						onError: fail("Could not submit the quote."),
					});
				}}
			/>
			<ReasonDialog
				open={dialog?.kind === "quote-cancel"}
				onOpenChange={(open) => !open && close_()}
				title={`Cancel quote ${quoteDialog?.quoteNumber ?? ""}?`}
				description={`The quote from ${quoteDialog?.supplierName ?? "the supplier"} is no longer compared. Enter a new quote if they send one.`}
				actionLabel="Cancel quote"
				pendingLabel="Cancelling…"
				pending={cancelQuote.isPending}
				error={dialog?.kind === "quote-cancel" ? error : null}
				onConfirm={(reason) => {
					if (!quoteDialog) return;
					setError(null);
					cancelQuote.mutate(
						{ quoteId: quoteDialog.id, reason },
						{ onSuccess: close_, onError: fail("Could not cancel the quote.") },
					);
				}}
			/>
		</div>
	);
}
