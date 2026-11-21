"use client";

import Link from "next/link";

import { EnterInvoiceButton } from "@/components/pages/supplier-invoices/EnterInvoiceButton";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	sinvErrorMessage,
	useSupplierInvoicesQuery,
} from "@/lib/api/supplier-invoice/queries";
import { formatMoney } from "@/lib/format";

/** "Invoices" card on PO and GRN detail (BR-SINV-39). Not rendered without `invoice.view`. */
export function InvoicesCard({
	poId,
	grnId,
	canEnter = true,
}: {
	poId?: number;
	grnId?: number;
	/** Caller's status gate for the "Enter supplier invoice" button in the empty state. */
	canEnter?: boolean;
}) {
	const canView = useCan("invoice.view");
	const query = useSupplierInvoicesQuery(
		{
			page: 1,
			pageSize: 20,
			sortBy: "createdAt",
			sortDir: "desc",
			poId,
			grnId,
		},
		canView,
	);
	if (!canView) return null;
	const rows = query.data?.data ?? [];
	return (
		<Card>
			<CardHeader>
				<CardTitle>Invoices</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<div className="flex flex-col gap-2" aria-busy="true">
						<Skeleton className="h-8" />
						<Skeleton className="h-8" />
						<Skeleton className="h-8" />
					</div>
				) : query.isError ? (
					<ErrorState
						message={sinvErrorMessage(
							query.error,
							"The invoices could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				) : rows.length === 0 ? (
					<div className="flex flex-col items-start gap-2 text-sm">
						<p className="text-muted-foreground">No invoices yet</p>
						{poId !== undefined && canEnter ? (
							<EnterInvoiceButton poId={poId} grnId={grnId} />
						) : null}
					</div>
				) : (
					<ul className="flex flex-col gap-2 text-sm">
						{rows.map((row) => (
							<li
								key={row.id}
								className="flex flex-wrap items-center justify-between gap-2"
							>
								<span className="flex flex-wrap items-center gap-2">
									<Link
										href={`/supplier-invoices/${row.id}`}
										className="font-mono text-brand-accent hover:underline"
									>
										{row.ourNumber}
									</Link>
									<StatusBadge doc="supplierInvoice" status={row.status} />
									{row.overdue ? (
										<StatusBadge doc="supplierInvoice" status="overdue" />
									) : null}
								</span>
								<span className="tabular-nums">
									{formatMoney(row.totalPaise)}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
