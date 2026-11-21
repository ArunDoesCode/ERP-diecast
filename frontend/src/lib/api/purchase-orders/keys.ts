import type { PurchaseOrderListParams } from "@/types/purchase-orders";

export const purchaseOrderKeys = {
	cards: (params?: PurchaseOrderListParams) =>
		params
			? (["purchase-orders", "cards", params] as const)
			: (["purchase-orders", "cards"] as const),
	detail: (poId: number) => ["purchase-orders", "detail", poId] as const,
	communications: (poId: number) =>
		["purchase-orders", "communications", poId] as const,
	lastRate: (itemId: number, supplierId: number) =>
		["purchase-orders", "last-rate", itemId, supplierId] as const,
	priceRows: (supplierId: number, itemIds: number[]) =>
		["purchase-orders", "price-rows", supplierId, itemIds] as const,
};
