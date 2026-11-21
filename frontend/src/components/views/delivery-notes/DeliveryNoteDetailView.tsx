"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import {
	DnActionDialogs,
	type DnDialog,
} from "@/components/pages/delivery-notes/DnActionDialogs";
import {
	DnHistoryCard,
	DnLinesCard,
	DnPackagesCard,
	DnTransportCard,
} from "@/components/pages/delivery-notes/DnDetailCards";
import {
	DnActivityCard,
	DnCustomerCard,
	DnStockCard,
} from "@/components/pages/delivery-notes/DnSidePanels";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { DocumentFlow } from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
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
	dnErrorMessage,
	useDeliveryNoteQuery,
} from "@/lib/api/delivery-note/queries";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

export function DeliveryNoteDetailView({ noteId }: { noteId: number }) {
	const canView = useCan("dispatch.view");
	const canManage = useCan("dispatch.manage");
	const canCancel = useCan("dispatch.cancel");
	const canViewSo = useCan("so.view");
	const query = useDeliveryNoteQuery(canView ? noteId : undefined);
	const note = query.data?.data;
	useBreadcrumbLast(note ? (note.dnNumber ?? "Draft") : undefined);
	const [dialog, setDialog] = useState<DnDialog | null>(null);

	const back = { backHref: "/delivery-notes", backLabel: "delivery notes" };

	if (!canView) return <NoAccessState what="delivery notes" />;
	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !note) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader
					title="Delivery note not found"
					actions={
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href={back.backHref}>Back to {back.backLabel}</Link>
						</Button>
					}
				/>
				{notFound ? (
					<EmptyState title="It may have been removed, or the link is wrong" />
				) : (
					<ErrorState
						message={dnErrorMessage(
							query.error,
							"The delivery note could not be loaded.",
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

	const isDraft = note.status === "draft";
	const isPosted = note.status === "posted";
	const isCancelled = note.status === "cancelled";
	const showPost = isDraft && canManage;
	const showMore = (isDraft && canManage) || (isPosted && canCancel);
	const soNotConfirmed = isDraft && note.soStatus !== "confirmed";

	const actions = (
		<>
			{showPost ? (
				<Button
					type="button"
					size="sm"
					disabled={soNotConfirmed}
					onClick={() => setDialog("post")}
				>
					Post note
				</Button>
			) : null}
			{isDraft && canManage ? (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href={`/delivery-notes/${note.id}/edit`}>Edit</Link>
				</Button>
			) : null}
			{isPosted ? (
				<Button type="button" size="sm" asChild>
					<Link href={`/delivery-notes/${note.id}/print`}>Print</Link>
				</Button>
			) : null}
			{isDraft ? (
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href={`/delivery-notes/${note.id}/print`}>Print draft</Link>
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
						{isDraft && canManage ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancelDraft")}
							>
								Cancel draft
							</DropdownMenuItem>
						) : null}
						{isPosted && canCancel ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancelPosted")}
							>
								Cancel note
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
				docNo={note.dnNumber ?? "Draft"}
				docNoPlain={note.dnNumber === null}
				status={<StatusBadge doc="dn" status={note.status} />}
				meta={[
					{ label: "Customer", value: note.customer.name },
					{ label: "Note date", value: formatDate(note.noteDate) },
					...(note.valuePaise !== undefined
						? [{ label: "Value", value: formatMoney(note.valuePaise) }]
						: []),
					...(note.postedBy
						? [
								{
									label: "Posted",
									value: `${note.postedBy.name}, ${formatDateTime(note.postedAt)}`,
								},
							]
						: []),
				]}
				actions={actions}
				{...back}
			/>

			<DocumentFlow
				steps={[
					{
						label: "Sale order",
						docNo: note.soNumber,
						href: canViewSo ? `/sale-orders/${note.soId}` : undefined,
						status: <StatusBadge doc="so" status={note.soStatus} />,
						state: "done",
					},
					{
						label: "Delivery note",
						docNo: note.dnNumber ?? undefined,
						status: <StatusBadge doc="dn" status={note.status} />,
						state: "current",
					},
				]}
			/>

			{soNotConfirmed ? (
				<output className="block rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
					The order is not confirmed any more, so this draft cannot be posted.
					It can still be edited or cancelled.
				</output>
			) : null}
			{isCancelled ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					Cancelled{note.cancelledBy ? ` by ${note.cancelledBy.name}` : ""}
					{note.cancelledAt ? ` on ${formatDate(note.cancelledAt)}` : ""}
					{note.cancelReason ? `: ${note.cancelReason}` : ""}
				</output>
			) : null}

			<DnLinesCard note={note} />

			<div className="grid gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
				<div className="flex min-w-0 flex-col gap-4">
					<DnPackagesCard note={note} />
					<DnTransportCard
						note={note}
						canUpdate={canManage}
						onUpdate={() => setDialog("transport")}
					/>
					<DnHistoryCard note={note} />
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<DnCustomerCard note={note} canViewSo={canViewSo} />
					<DnStockCard note={note} />
					<DnActivityCard note={note} />
				</div>
			</div>

			<DnActionDialogs
				note={note}
				open={dialog}
				onClose={() => setDialog(null)}
			/>
		</div>
	);
}
