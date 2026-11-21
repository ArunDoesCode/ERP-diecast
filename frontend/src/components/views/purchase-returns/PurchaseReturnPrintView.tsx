"use client";

import { IconPrinter } from "@tabler/icons-react";
import Link from "next/link";

import {
	DebitNoteSheet,
	ReturnChallanSheet,
} from "@/components/pages/purchase-returns/ReturnPrintSheets";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	prtErrorMessage,
	usePurchaseReturnQuery,
} from "@/lib/api/purchase-return/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

export type PrintKind = "debit-note" | "challan";

/** Debit note or return challan: the details data in a print sheet, always light (BR-PRT-33, 35). */
export function PurchaseReturnPrintView({
	returnId,
	kind,
}: {
	returnId: number;
	kind: PrintKind;
}) {
	const canView = useCan("purchase_return.view");
	const query = usePurchaseReturnQuery(canView ? returnId : undefined);
	const prt = query.data?.data;
	const note = prt?.debitNote ?? null;
	useBreadcrumbLast(prt?.proNumber);

	if (!canView) {
		return <EmptyState title="You can't view purchase returns" />;
	}
	if (query.isLoading) {
		return <Skeleton className="mx-auto h-96 w-full max-w-4xl" />;
	}
	if (query.isError || !prt) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return notFound ? (
			<EmptyState title="Return not found" />
		) : (
			<ErrorState
				message={prtErrorMessage(
					query.error,
					"The return could not be loaded.",
				)}
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}

	const title =
		kind === "debit-note"
			? `Debit note ${note?.dnNumber ?? prt.proNumber}`
			: `Return challan ${prt.challanNumber ?? prt.proNumber}`;
	const back = (
		<Button type="button" size="sm" variant="outline" asChild>
			<Link href={`/purchase-returns/${prt.id}`}>Back to return</Link>
		</Button>
	);

	if (!note) {
		return (
			<div className="flex w-full flex-col gap-4">
				<PageHeader title={prt.proNumber} actions={back} />
				<EmptyState title="Post the return to print" />
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="print:hidden">
				<PageHeader
					title={title}
					actions={
						<>
							{back}
							<Button type="button" size="sm" onClick={() => window.print()}>
								<IconPrinter />
								Print
							</Button>
						</>
					}
				/>
			</div>
			{kind === "debit-note" ? (
				<DebitNoteSheet prt={prt} note={note} />
			) : (
				<ReturnChallanSheet prt={prt} note={note} />
			)}
		</div>
	);
}
