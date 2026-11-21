import { PurchaseReturnFormView } from "@/components/views/purchase-returns/PurchaseReturnFormView";

type NewPurchaseReturnPageProps = {
	searchParams: Promise<{ grnId?: string }>;
};

export default async function NewPurchaseReturnPage({
	searchParams,
}: NewPurchaseReturnPageProps) {
	const grnId = Number((await searchParams).grnId);
	return (
		<PurchaseReturnFormView
			grnId={Number.isInteger(grnId) && grnId > 0 ? grnId : undefined}
		/>
	);
}
