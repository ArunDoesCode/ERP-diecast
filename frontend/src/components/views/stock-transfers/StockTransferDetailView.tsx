"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import {
	TransferActionDialogs,
	type TransferDialog,
} from "@/components/pages/stock-transfers/TransferActionDialogs";
import {
	TransferDetailsCard,
	TransferHistoryCard,
	TransferLinesCard,
} from "@/components/pages/stock-transfers/TransferPanels";
import { DetailHeader } from "@/components/shared/DetailHeader";
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
	stErrorMessage,
	useStockTransferQuery,
} from "@/lib/api/stock-transfer/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

export function StockTransferDetailView({
	transferId,
}: {
	transferId: number;
}) {
	const canView = useCan("inventory.view");
	const canManage = useCan("stock_transfer.manage");
	const canReverse = useCan("stock_transfer.reverse");
	const query = useStockTransferQuery(canView ? transferId : undefined);
	const transfer = query.data?.data;
	useBreadcrumbLast(transfer?.transferNumber);
	const [dialog, setDialog] = useState<TransferDialog | null>(null);

	const back = {
		backHref: "/inventory/stock-transfers",
		backLabel: "stock transfers",
	};

	if (!canView) {
		return <NoAccessState what="stock transfers" />;
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
	if (query.isError || !transfer) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader
					title={notFound ? "Transfer not found" : "Transfer"}
					actions={
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href={back.backHref}>Back to stock transfers</Link>
						</Button>
					}
				/>
				{notFound ? (
					<EmptyState title="It may have been deleted, or the link is wrong" />
				) : (
					<ErrorState
						message={stErrorMessage(
							query.error,
							"The transfer could not be loaded.",
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

	const isDraft = transfer.status === "draft";
	const isPosted = transfer.status === "posted";
	const showMore = (isDraft && canManage) || (isPosted && canReverse);

	const actions = (
		<>
			{isDraft && canManage ? (
				<>
					<Button type="button" size="sm" onClick={() => setDialog("post")}>
						Post transfer
					</Button>
					<Button type="button" size="sm" variant="outline" asChild>
						<Link href={`/inventory/stock-transfers/${transfer.id}/edit`}>
							Edit
						</Link>
					</Button>
				</>
			) : null}
			{!isDraft && canManage ? (
				<Button type="button" size="sm" asChild>
					<Link href="/inventory/stock-transfers/new">New transfer</Link>
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
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancel")}
							>
								Cancel transfer
							</DropdownMenuItem>
						) : null}
						{isPosted ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("reverse")}
							>
								Reverse
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
				docNo={transfer.transferNumber}
				status={<StatusBadge doc="st" status={transfer.status} />}
				meta={[
					{ label: "From", value: transfer.source.name },
					{ label: "To", value: transfer.destination.name },
				]}
				actions={actions}
				{...back}
			/>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
				<div className="flex min-w-0 flex-col gap-4">
					<TransferLinesCard transfer={transfer} />
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<TransferDetailsCard transfer={transfer} />
					<TransferHistoryCard transfer={transfer} />
				</div>
			</div>

			<TransferActionDialogs
				transfer={transfer}
				open={dialog}
				onClose={() => setDialog(null)}
			/>
		</div>
	);
}
