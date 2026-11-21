"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import {
	ReturnActionDialogs,
	type ReturnDialog,
} from "@/components/pages/purchase-returns/ReturnActionDialogs";
import {
	ReturnLinesCard,
	ReturnPreviewCard,
	ReturnReasonCard,
} from "@/components/pages/purchase-returns/ReturnLinesCard";
import {
	ReturnActivityCard,
	ReturnDebitNoteCard,
	ReturnFactsCard,
} from "@/components/pages/purchase-returns/ReturnSidePanels";
import { DetailHeader } from "@/components/shared/DetailHeader";
import {
	DocumentFlow,
	type DocumentFlowStep,
} from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
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
	prtErrorMessage,
	usePurchaseReturnQuery,
} from "@/lib/api/purchase-return/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { PrtDetail } from "@/types/purchase-return";

const FLOW_LABEL = {
	po: "Purchase order",
	grn: "Goods receipt",
	return: "Purchase return",
} as const;

function flowSteps(prt: PrtDetail): DocumentFlowStep[] {
	return prt.documentFlow.map((step) => ({
		label: FLOW_LABEL[step.step],
		docNo: step.docNo,
		// PO detail is keyed by its requisition, so the PO step has no link of its own.
		href:
			step.step === "grn"
				? `/grn/${step.id}`
				: step.step === "return" && step.id !== prt.id
					? `/purchase-returns/${step.id}`
					: undefined,
		status: (
			<StatusBadge
				doc={
					step.step === "po"
						? "po"
						: step.step === "grn"
							? "grn"
							: "purchaseReturn"
				}
				status={step.status}
			/>
		),
		state: step.step === "return" && step.id === prt.id ? "current" : "done",
	}));
}

export function PurchaseReturnDetailView({ returnId }: { returnId: number }) {
	const canView = useCan("purchase_return.view");
	const canEdit = useCan("purchase_return.edit_draft");
	const canPost = useCan("purchase_return.post");
	const canCancelPosted = useCan("purchase_return.cancel_posted");
	const query = usePurchaseReturnQuery(canView ? returnId : undefined);
	const prt = query.data?.data;
	useBreadcrumbLast(prt?.proNumber);
	const [dialog, setDialog] = useState<ReturnDialog | null>(null);

	const back = { backHref: "/purchase-returns", backLabel: "purchase returns" };

	if (!canView) {
		return <EmptyState title="You can't view purchase returns" />;
	}
	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !prt) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				{notFound ? (
					<EmptyState title="Return not found" />
				) : (
					<ErrorState
						message={prtErrorMessage(
							query.error,
							"The return could not be loaded.",
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

	const isDraft = prt.status === "draft";
	const isPosted = prt.status === "posted";
	const isCancelled = prt.status === "cancelled";
	const showPost = isDraft && canPost;
	const editPrimary = isDraft && canEdit && !canPost;
	const showMore = (isDraft && canEdit) || (isPosted && canCancelPosted);

	const actions = (
		<>
			{showPost ? (
				<Button type="button" size="sm" onClick={() => setDialog("post")}>
					Post return
				</Button>
			) : null}
			{isDraft && canEdit ? (
				<Button
					type="button"
					size="sm"
					variant={editPrimary ? "default" : "outline"}
					asChild
				>
					<Link href={`/purchase-returns/${prt.id}/edit`}>Edit</Link>
				</Button>
			) : null}
			{isPosted ? (
				<>
					<Button type="button" size="sm" asChild>
						<Link href={`/purchase-returns/${prt.id}/debit-note`}>
							Print debit note
						</Link>
					</Button>
					<Button type="button" size="sm" variant="outline" asChild>
						<Link href={`/purchase-returns/${prt.id}/challan`}>
							Print return challan
						</Link>
					</Button>
				</>
			) : null}
			{isCancelled && prt.debitNote ? (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href={`/purchase-returns/${prt.id}/debit-note`}>
						Print debit note
					</Link>
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
						{isDraft && canEdit ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancelDraft")}
							>
								Cancel draft
							</DropdownMenuItem>
						) : null}
						{isPosted && canCancelPosted ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancelPosted")}
							>
								Cancel return
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</>
	);

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			<DetailHeader
				docNo={prt.proNumber}
				status={<StatusBadge doc="purchaseReturn" status={prt.status} />}
				meta={[
					{ label: "Supplier", value: prt.supplierName },
					{
						label: "GRN",
						value: <span className="font-mono">{prt.grnNumber}</span>,
					},
					{
						label: "PO",
						value: <span className="font-mono">{prt.poNumber}</span>,
					},
					{ label: "Date", value: formatDate(prt.createdAt) },
				]}
				actions={actions}
				{...back}
			/>

			<DocumentFlow steps={flowSteps(prt)} />

			{isCancelled ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					Cancelled
					{prt.cancelledAt ? ` (${formatDateTime(prt.cancelledAt)})` : ""}
					{prt.cancelReason ? `: ${prt.cancelReason}` : ""}
				</output>
			) : null}

			<div className="grid gap-4 min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
				<div className="flex min-w-0 flex-col gap-4">
					<ReturnLinesCard prt={prt} />
					<ReturnPreviewCard prt={prt} />
					<ReturnReasonCard prt={prt} />
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<ReturnFactsCard prt={prt} />
					<ReturnDebitNoteCard prt={prt} />
					<ReturnActivityCard prt={prt} />
				</div>
			</div>

			<ReturnActionDialogs
				prt={prt}
				open={dialog}
				onClose={() => setDialog(null)}
			/>
		</div>
	);
}
