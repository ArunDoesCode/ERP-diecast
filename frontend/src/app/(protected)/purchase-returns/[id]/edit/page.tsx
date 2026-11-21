import { notFound } from "next/navigation";

import { PurchaseReturnFormView } from "@/components/views/purchase-returns/PurchaseReturnFormView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function EditPurchaseReturnPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <PurchaseReturnFormView returnId={id} />;
}
