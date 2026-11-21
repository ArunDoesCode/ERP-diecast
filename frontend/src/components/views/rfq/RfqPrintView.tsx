"use client";

import { IconPrinter } from "@tabler/icons-react";
import Link from "next/link";

import { RfqPrintSheets } from "@/components/pages/rfq/RfqPrintSheets";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import { rfqErrorMessage, useRfqPrintQuery } from "@/lib/api/rfq/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

/** Browser print of one A4 sheet per supplier, always light (screens.md 6). `?supplier=` prints one. */
export function RfqPrintView({
	rfqId,
	supplierId,
}: {
	rfqId: number;
	supplierId?: number;
}) {
	const canView = useCan("rfq.view");
	const query = useRfqPrintQuery(canView ? rfqId : undefined);
	const print = query.data?.data;
	useBreadcrumbLast(print?.rfqNumber);

	if (!canView) {
		return <NoAccessState what="requests for quotation" />;
	}
	if (query.isLoading) {
		return <Skeleton className="mx-auto h-96 w-full max-w-4xl" />;
	}
	if (query.isError || !print) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return notFound ? (
			<EmptyState title="RFQ not found" />
		) : (
			<ErrorState
				message={rfqErrorMessage(
					query.error,
					"The sheets could not be loaded.",
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
					title={`Print sheets · ${print.rfqNumber}`}
					actions={
						<>
							<Button type="button" size="sm" variant="outline" asChild>
								<Link href={`/rfq/${rfqId}`}>Back to RFQ</Link>
							</Button>
							<Button type="button" size="sm" onClick={() => window.print()}>
								<IconPrinter />
								Print
							</Button>
						</>
					}
				/>
			</div>
			<RfqPrintSheets print={print} supplierId={supplierId} />
		</div>
	);
}
