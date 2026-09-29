"use client";

import { ScoForm } from "@/components/pages/subcontracting/ScoForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useScoDetailQuery } from "@/lib/api/subcontracting/queries";

/** No scoId = create; with scoId = edit a draft. */
export function ScoFormView({ scoId }: { scoId?: number }) {
	const canManage = useCan("sco.manage");
	const detailQuery = useScoDetailQuery(scoId ?? 0);

	if (!canManage) {
		return (
			<p className="p-6 text-sm text-muted-foreground">
				You do not have permission to create or edit orders.
			</p>
		);
	}

	if (scoId === undefined) return <ScoForm />;

	if (detailQuery.isLoading) {
		return <Skeleton className="m-6 h-64" />;
	}

	const result = detailQuery.data;
	if (!result?.success) {
		return (
			<p className="p-6 text-sm text-muted-foreground">
				{result?.message ?? "Order not found."}
			</p>
		);
	}

	if (result.data.sco.status !== "draft") {
		return (
			<p className="p-6 text-sm text-muted-foreground">
				Only a draft order can be edited.
			</p>
		);
	}

	// key resets local form state if the order is refetched under a new update.
	return (
		<ScoForm
			key={result.data.sco.lastUpdatedAt ?? result.data.sco.id}
			existing={result.data}
		/>
	);
}
