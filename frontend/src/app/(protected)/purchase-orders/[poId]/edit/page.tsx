import { notFound } from "next/navigation";

import { PurchaseOrderFormView } from "@/components/views/purchase-orders/PurchaseOrderFormView";

type EditPurchaseOrderPageProps = {
	params: Promise<{ poId: string }>;
};

export default async function EditPurchaseOrderPage({
	params,
}: EditPurchaseOrderPageProps) {
	const resolved = await params;
	const poId = Number(resolved.poId);

	if (!Number.isInteger(poId) || poId <= 0) {
		notFound();
	}

	return <PurchaseOrderFormView poId={poId} />;
}
