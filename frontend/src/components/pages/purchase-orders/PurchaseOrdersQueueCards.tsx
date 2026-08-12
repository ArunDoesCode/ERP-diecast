"use client";

import { IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	getPRStatusBadgeStyle,
	humanizeStatusLabel,
} from "@/lib/pr-status-badge";
import type { PurchaseRequisition } from "@/types/purchase-requisitions";

type PurchaseOrdersQueueCardsProps = {
	requisitions: PurchaseRequisition[];
	isLoading: boolean;
};

const SKELETON_CARDS = 6;

function formatMoney(paise?: number | null) {
	return `₹${((paise ?? 0) / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 0,
	})}`;
}

function formatDate(value?: string | null) {
	if (!value) return "-";
	return new Date(value).toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "short",
	});
}

export function PurchaseOrdersQueueCards({
	requisitions,
	isLoading,
}: PurchaseOrdersQueueCardsProps) {
	const router = useRouter();

	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: SKELETON_CARDS }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
					<Card key={`po-queue-skeleton-${index}`}>
						<CardHeader className="space-y-2">
							<Skeleton className="h-5 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</CardHeader>
						<CardContent className="space-y-3">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-5/6" />
							<Skeleton className="h-4 w-2/3" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (requisitions.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No approved PRs waiting for PO.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{requisitions.map((pr) => {
				const badgeStyle = getPRStatusBadgeStyle(pr.status);

				return (
					<Card key={pr.id}>
						<CardHeader className="space-y-2">
							<div className="flex items-start justify-between gap-2">
								<CardTitle>
									<button
										type="button"
										onClick={() => router.push(`/purchase-orders/${pr.id}`)}
										className="cursor-pointer text-left text-base hover:underline"
									>
										{pr.prNumber}
									</button>
								</CardTitle>
								<Badge
									variant={badgeStyle.variant}
									className={badgeStyle.className}
								>
									{humanizeStatusLabel(pr.status)}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="grid gap-2 text-xs text-muted-foreground">
							<div className="flex items-center justify-between gap-2">
								<span>{pr.type}</span>
								<span>{formatMoney(pr.estimatedAmountPaise)}</span>
							</div>
							<div className="flex items-center gap-1">
								<IconCalendar className="size-3.5" />
								Created {formatDate(pr.createdAt)}
							</div>
							<p className="line-clamp-2">{pr.notes?.trim() || "No notes"}</p>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
