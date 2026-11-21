import { notFound } from "next/navigation";

import { SaleOrderFormView } from "@/components/views/sale-orders/SaleOrderFormView";

type EditSaleOrderPageProps = {
	params: Promise<{ id: string }>;
};

export default async function EditSaleOrderPage({
	params,
}: EditSaleOrderPageProps) {
	const soId = Number((await params).id);
	if (!Number.isInteger(soId) || soId <= 0) notFound();
	return <SaleOrderFormView soId={soId} />;
}
