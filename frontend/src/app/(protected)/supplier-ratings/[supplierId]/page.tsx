import { notFound } from "next/navigation";

import { SupplierRatingDrilldownView } from "@/components/views/supplier-ratings/SupplierRatingDrilldownView";

type Props = {
	params: Promise<{ supplierId: string }>;
};

export default async function SupplierRatingDrilldownPage({ params }: Props) {
	const resolved = await params;
	const supplierId = Number(resolved.supplierId);

	if (!Number.isInteger(supplierId) || supplierId <= 0) {
		notFound();
	}

	return <SupplierRatingDrilldownView supplierId={supplierId} />;
}
