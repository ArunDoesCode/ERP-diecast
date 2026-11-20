import { notFound } from "next/navigation";

import { PurchaseOrderPageView } from "@/components/views/purchase-orders/PurchaseOrderPageView";

type PurchaseOrderPageProps = {
	params: Promise<{ poId: string }>;
};

export default async function PurchaseOrderPage({
	params,
}: PurchaseOrderPageProps) {
	const resolved = await params;
	const poId = Number(resolved.poId);

	if (!Number.isInteger(poId) || poId <= 0) {
		notFound();
	}

	return <PurchaseOrderPageView poId={poId} />;
}
