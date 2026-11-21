import { notFound } from "next/navigation";

import { PurchaseRequisitionPageView } from "@/components/views/purchase-requisitions/PurchaseRequisitionPageView";

type PurchaseRequisitionPageProps = {
	params: Promise<{ prId: string }>;
};

export default async function PurchaseRequisitionPage({
	params,
}: PurchaseRequisitionPageProps) {
	const resolved = await params;
	const prId = Number(resolved.prId);

	if (!Number.isInteger(prId) || prId <= 0) {
		notFound();
	}

	return <PurchaseRequisitionPageView prId={prId} />;
}
