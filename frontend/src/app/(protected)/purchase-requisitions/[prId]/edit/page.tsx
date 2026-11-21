import { notFound } from "next/navigation";

import { PurchaseRequisitionFormView } from "@/components/views/purchase-requisitions/PurchaseRequisitionFormView";

type EditPurchaseRequisitionPageProps = {
	params: Promise<{ prId: string }>;
};

export default async function EditPurchaseRequisitionPage({
	params,
}: EditPurchaseRequisitionPageProps) {
	const resolved = await params;
	const prId = Number(resolved.prId);

	if (!Number.isInteger(prId) || prId <= 0) {
		notFound();
	}

	return <PurchaseRequisitionFormView mode="edit" prId={prId} />;
}
