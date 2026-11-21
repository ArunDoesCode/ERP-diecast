import { InventoryMovementsView } from "@/components/views/inventory/InventoryMovementsView";
import { assetReferenceTypeValues } from "@/types/asset";

type Props = {
	searchParams: Promise<{ referenceType?: string }>;
};

export default async function InventoryMovementsPage({ searchParams }: Props) {
	const { referenceType } = await searchParams;
	const initialReferenceType = assetReferenceTypeValues.find(
		(type) => type === referenceType,
	);
	return <InventoryMovementsView initialReferenceType={initialReferenceType} />;
}
