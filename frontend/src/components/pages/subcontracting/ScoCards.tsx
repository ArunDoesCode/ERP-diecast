"use client";

import { IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	formatScoDate,
	getScoStatusBadgeStyle,
	SCO_STATUS_LABEL,
} from "@/lib/sco-format";
import type { Sco } from "@/types/subcontracting";

type ScoCardsProps = {
	orders: Sco[];
	isLoading: boolean;
};

const SKELETON_CARDS = 6;

export function ScoCards({ orders, isLoading }: ScoCardsProps) {
	const router = useRouter();

	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: SKELETON_CARDS }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
					<Card key={`sco-skeleton-${index}`}>
						<CardHeader className="space-y-2">
							<Skeleton className="h-5 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</CardHeader>
						<CardContent className="space-y-3">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-2/3" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (orders.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No subcontracting orders found.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{orders.map((sco) => {
				const badgeStyle = getScoStatusBadgeStyle(sco.status);

				return (
					<Card
						key={sco.id}
						className="cursor-pointer transition-colors hover:bg-accent/40"
						onClick={() => router.push(`/subcontracting/${sco.id}`)}
					>
						<CardHeader className="space-y-2">
							<div className="flex items-start justify-between gap-2">
								<CardTitle>{sco.scoNumber}</CardTitle>
								<Badge
									variant={badgeStyle.variant}
									className={badgeStyle.className}
								>
									{SCO_STATUS_LABEL[sco.status]}
								</Badge>
							</div>
							<p className="text-xs text-muted-foreground">{sco.vendorName}</p>
						</CardHeader>
						<CardContent className="space-y-2 text-xs">
							<div className="flex items-center gap-1 text-muted-foreground">
								<IconCalendar className="size-3.5" />
								Return by {formatScoDate(sco.expectedReturnDate)}
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Total incl. GST</span>
								<span className="font-medium">
									{formatPaise(sco.totalAmountPaise)}
								</span>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
