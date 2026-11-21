"use client";

import { InventoryMovementsManager } from "@/components/pages/inventory/InventoryMovementsManager";
import type { AssetReferenceType } from "@/types/asset";

export function InventoryMovementsView({
	initialReferenceType,
}: {
	initialReferenceType?: AssetReferenceType;
}) {
	return (
		<InventoryMovementsManager
			key={initialReferenceType ?? "all"}
			initialReferenceType={initialReferenceType}
		/>
	);
}
