"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerQuery } from "@/lib/api/customers/queries";
import { formatDateTime } from "@/lib/format";
import { stateName } from "@/types/customer";
import type { SoDetail } from "@/types/sale-order";

function Pair({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-2">
			<dt className="w-28 shrink-0 font-semibold text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 whitespace-pre-line">{value}</dd>
		</div>
	);
}

export function SoNotesCard({ so }: { so: SoDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Notes</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-2 text-sm">
				<p className="whitespace-pre-line">{so.notes ?? "No notes."}</p>
				<dl className="flex flex-col gap-1 text-[13px]">
					<Pair
						label="Created"
						value={`${so.createdByName} ${formatDateTime(so.createdAt)}`}
					/>
					{so.confirmedAt ? (
						<Pair label="Confirmed" value={formatDateTime(so.confirmedAt)} />
					) : null}
				</dl>
			</CardContent>
		</Card>
	);
}

export function SoCustomerCard({ so }: { so: SoDetail }) {
	const query = useCustomerQuery(so.customerId);
	const customer = query.data?.data;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Customer</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<Skeleton className="h-16" />
				) : (
					<dl className="flex flex-col gap-1 text-sm">
						<Pair label="Name" value={so.customerName} />
						{customer ? (
							<>
								<Pair label="State" value={stateName(customer.stateCode)} />
								<Pair label="GSTIN" value={customer.gstin ?? "–"} />
								<Pair label="Address" value={customer.address} />
							</>
						) : null}
						{so.shipToAddress ? (
							<>
								<Pair label="Ship to" value={so.shipToAddress} />
								<Pair
									label="Ship-to state"
									value={stateName(so.shipToStateCode)}
								/>
							</>
						) : null}
					</dl>
				)}
			</CardContent>
		</Card>
	);
}
