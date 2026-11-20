"use client";

import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder for the approvals inbox (used by the route's loading.tsx).
export function ApprovalCardsSkeleton() {
	return (
		<div className="flex flex-col gap-2" aria-busy="true">
			{Array.from({ length: 8 }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
				<Skeleton key={`approval-skeleton-${index}`} className="h-9 w-full" />
			))}
		</div>
	);
}
