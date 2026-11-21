"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";
import { useBillableLinesQuery } from "@/lib/api/supplier-invoice/queries";

/**
 * Next step "Enter supplier invoice" (BR-SINV-38): only with `invoice.manage`
 * and something left to bill. Outline, so the page keeps its own primary action.
 */
export function EnterInvoiceButton({
	poId,
	grnId,
	enabled = true,
}: {
	poId: number;
	grnId?: number;
	/** Caller's status gate (PO or GRN status that can be billed). */
	enabled?: boolean;
}) {
	const canManage = useCan("invoice.manage");
	const query = useBillableLinesQuery(poId, grnId, canManage && enabled);
	if (!canManage || !enabled) return null;
	const lines = query.data?.data.lines ?? [];
	if (lines.length === 0) return null;
	const href = `/supplier-invoices/new?poId=${poId}${grnId ? `&grnId=${grnId}` : ""}`;
	return (
		<Button type="button" size="sm" variant="outline" asChild>
			<Link href={href}>Enter supplier invoice</Link>
		</Button>
	);
}
