"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { DeliveryNoteForm } from "@/components/pages/delivery-notes/DeliveryNoteForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useLocationsQuery } from "@/lib/api/asset/queries";
import {
	dnErrorMessage,
	useDeliveryNoteQuery,
	useDispatchSettingsQuery,
} from "@/lib/api/delivery-note/queries";
import { useSaleOrderQuery } from "@/lib/api/sale-order/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

/** New note (`soId`, optional `lineId` ticked) or edit a draft (`noteId`). */
export function DeliveryNoteFormView({
	soId,
	noteId,
	lineId,
}: {
	soId?: number;
	noteId?: number;
	lineId?: number;
}) {
	const router = useRouter();
	const canManage = useCan("dispatch.manage");
	const canSoView = useCan("so.view");
	const detailQuery = useDeliveryNoteQuery(canManage ? noteId : undefined);
	const existing = detailQuery.data?.data;
	const sourceSoId = noteId === undefined ? soId : existing?.soId;
	const soQuery = useSaleOrderQuery(canSoView ? sourceSoId : undefined);
	const settingsQuery = useDispatchSettingsQuery(canManage);
	const locationsQuery = useLocationsQuery({
		page: 1,
		pageSize: 100,
		isActive: true,
	});
	useBreadcrumbLast(
		noteId === undefined
			? "New delivery note"
			: (existing?.dnNumber ?? "Draft"),
	);

	const locations = useMemo(
		() =>
			(locationsQuery.data?.data ?? []).filter(
				(l) => l.isActive && !l.isVirtual && l.type !== "vendor_premise",
			),
		[locationsQuery.data],
	);
	// Same default as the server (BR-DSP-08): Finished Goods, lowest id, else the main store.
	const defaultLocationId = useMemo(() => {
		const lowest = (type: string) =>
			locations.filter((l) => l.type === type).sort((a, b) => a.id - b.id)[0]
				?.id;
		return lowest("finished_goods") ?? lowest("main_store") ?? locations[0]?.id;
	}, [locations]);

	// Only drafts can be edited: anything else goes to the detail page.
	const status = existing?.status;
	useEffect(() => {
		if (noteId !== undefined && status !== undefined && status !== "draft") {
			router.replace(`/delivery-notes/${noteId}`);
		}
	}, [router, noteId, status]);

	if (!canManage) return <NoAccessState what="delivery note entry" />;
	if (noteId === undefined && soId === undefined) {
		return (
			<EmptyState
				title="Pick an order to dispatch"
				description="A delivery note starts from a sale order line."
				action={
					<Button type="button" size="sm" asChild>
						<Link href="/delivery-notes/pending">Pending dispatch</Link>
					</Button>
				}
			/>
		);
	}

	const loading =
		locationsQuery.isLoading ||
		settingsQuery.isLoading ||
		(noteId !== undefined && !existing && !detailQuery.isError);
	if (loading) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	const failed = detailQuery.isError
		? detailQuery
		: locationsQuery.isError
			? locationsQuery
			: null;
	if (failed) {
		return (
			<ErrorState
				message={dnErrorMessage(
					failed.error,
					"The delivery note could not be loaded.",
				)}
				onRetry={() => {
					void failed.refetch();
				}}
				retrying={failed.isRefetching}
			/>
		);
	}
	if (existing && existing.status !== "draft") return null;
	if (sourceSoId === undefined) return null;

	return (
		<DeliveryNoteForm
			key={existing ? `edit-${existing.id}` : `new-${sourceSoId}`}
			soId={sourceSoId}
			existing={existing}
			locations={locations.map((l) => ({ id: l.id, name: l.name }))}
			defaultLocationId={defaultLocationId}
			settings={settingsQuery.data?.data}
			so={soQuery.data?.data}
			preselectLineId={lineId}
		/>
	);
}
