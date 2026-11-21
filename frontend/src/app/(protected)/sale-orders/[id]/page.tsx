import { notFound } from "next/navigation";

import { SaleOrderDetailView } from "@/components/views/sale-orders/SaleOrderDetailView";

type SaleOrderPageProps = {
	params: Promise<{ id: string }>;
};

export default async function SaleOrderPage({ params }: SaleOrderPageProps) {
	const soId = Number((await params).id);
	if (!Number.isInteger(soId) || soId <= 0) notFound();
	return <SaleOrderDetailView soId={soId} />;
}
