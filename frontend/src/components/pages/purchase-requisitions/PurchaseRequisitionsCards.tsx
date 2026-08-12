"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	getPRStatusBadgeStyle,
	humanizeStatusLabel,
} from "@/lib/pr-status-badge";
import type { PurchaseRequisition } from "@/types/purchase-requisitions";

type PurchaseRequisitionsCardsProps = {
	requisitions: PurchaseRequisition[];
	isLoading: boolean;
	onSelect: (prId: number) => void;
};

const SKELETON_CARDS = 6;

export function PurchaseRequisitionsCards({
	requisitions,
	isLoading,
	onSelect,
}: PurchaseRequisitionsCardsProps) {
	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: SKELETON_CARDS }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
					<Card key={`pr-skeleton-${index}`}>
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
					No purchase requisitions found.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{requisitions.map((pr) => {
				const badgeStyle = getPRStatusBadgeStyle(pr.status);
				const isCancelled = pr.status === "cancelled";

				return (
					<Card key={pr.id} className={isCancelled ? "opacity-50" : ""}>
						<CardHeader className="space-y-2">
							<div className="flex items-start justify-between gap-2">
								<CardTitle>
									<button
										type="button"
										onClick={() => onSelect(pr.id)}
										className={
											isCancelled
												? "cursor-pointer text-left text-base text-muted-foreground hover:underline"
												: "cursor-pointer text-left text-base hover:underline"
										}
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
							{/* <p className="text-xs text-muted-foreground">PR ID: {pr.id}</p> */}
						</CardHeader>

						<CardContent className="space-y-2 text-xs text-muted-foreground">
							<p>Type: {pr.type}</p>
							<p>Notes: {pr.notes?.trim() ? pr.notes : "N/A"}</p>
							<div className="flex  justify-between">
								<p>Created: {new Date(pr.createdAt).toLocaleDateString()}</p>
								<p>Est Amt: ₹ {pr.estimatedAmountPaise / 100}</p>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
