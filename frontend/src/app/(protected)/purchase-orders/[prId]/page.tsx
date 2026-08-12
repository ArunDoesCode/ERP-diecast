import { notFound } from "next/navigation";

import { PurchaseOrderDetailView } from "@/components/views/purchase-orders/PurchaseOrderDetailView";

type PurchaseOrderDetailPageProps = {
	params: Promise<{ prId: string }>;
};

export default async function PurchaseOrderDetailPage({
	params,
}: PurchaseOrderDetailPageProps) {
	const resolved = await params;
	const prId = Number(resolved.prId);

	if (Number.isNaN(prId) || prId <= 0) {
		notFound();
	}

	return <PurchaseOrderDetailView prId={prId} />;
}
