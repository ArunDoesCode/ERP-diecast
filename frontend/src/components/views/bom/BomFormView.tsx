"use client";

import Link from "next/link";

import { BomForm } from "@/components/pages/bom/BomForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { bomErrorMessage, useBomQuery } from "@/lib/api/bom/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

type Props = {
	/** Present = edit this draft; absent = create. */
	bomId?: number;
	presetPart?: { id: number; sku?: string; name?: string };
};

export function BomFormView({ bomId, presetPart }: Props) {
	const canManage = useCan("bom.manage");
	const query = useBomQuery(bomId);
	const bom = query.data?.data;
	useBreadcrumbLast(bomId === undefined ? "New BOM" : bom?.number);

	if (!canManage) {
		return (
			<EmptyState title="You do not have permission to create or edit BOMs" />
		);
	}
	if (bomId === undefined) return <BomForm presetPart={presetPart} />;

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !bom) {
		return (
			<ErrorState
				message={bomErrorMessage(query.error, "BOM not found")}
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}
	if (bom.status !== "draft") {
		return (
			<EmptyState
				title="This revision is released and cannot be edited"
				action={
					<div className="flex gap-2">
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href={`/bom/part/${bom.partId}?rev=${bom.revision}`}>
								Open BOM
							</Link>
						</Button>
						{bom.nextStep === "start_revision" ? (
							<Button type="button" size="sm" asChild>
								<Link href={`/bom/part/${bom.partId}`}>Start revision</Link>
							</Button>
						) : null}
					</div>
				}
			/>
		);
	}
	// key resets local form state after a refetch under a new save.
	return <BomForm key={`${bom.id}-${bom.version}`} existing={bom} />;
}
