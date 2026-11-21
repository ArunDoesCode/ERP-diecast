import { notFound } from "next/navigation";

import { PurchaseReturnDetailView } from "@/components/views/purchase-returns/PurchaseReturnDetailView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function PurchaseReturnPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <PurchaseReturnDetailView returnId={id} />;
}
