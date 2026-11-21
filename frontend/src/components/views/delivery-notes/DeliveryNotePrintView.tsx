"use client";

import { IconPrinter } from "@tabler/icons-react";
import Link from "next/link";

import { DnPrintSheet } from "@/components/pages/delivery-notes/DnPrintSheet";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	dnErrorMessage,
	useDeliveryNoteQuery,
} from "@/lib/api/delivery-note/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

/** Delivery challan: the detail data in an always-light A4 sheet (BR-DSP-41). No API call on Print. */
export function DeliveryNotePrintView({ noteId }: { noteId: number }) {
	const canView = useCan("dispatch.view");
	const query = useDeliveryNoteQuery(canView ? noteId : undefined);
	const note = query.data?.data;
	useBreadcrumbLast(note ? (note.dnNumber ?? "Draft") : undefined);

	if (!canView) return <NoAccessState what="delivery notes" />;
	if (query.isLoading) {
		return <Skeleton className="mx-auto h-96 w-full max-w-4xl" />;
	}
	if (query.isError || !note) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return notFound ? (
			<EmptyState title="Delivery note not found" />
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
		);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="print:hidden">
				<PageHeader
					title={`Delivery note ${note.dnNumber ?? "(draft)"}`}
					actions={
						<>
							<Button type="button" size="sm" variant="outline" asChild>
								<Link href={`/delivery-notes/${note.id}`}>Back to note</Link>
							</Button>
							<Button type="button" size="sm" onClick={() => window.print()}>
								<IconPrinter />
								Print
							</Button>
						</>
					}
				/>
			</div>
			<DnPrintSheet note={note} />
		</div>
	);
}
