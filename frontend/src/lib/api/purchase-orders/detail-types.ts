import type { PurchaseOrderItem } from "@/types/purchase-orders";

/** Contract step 2: getpodetails lines add awaiting-QA and open qty (BR-FF-09, 43). Optional until the backend fills them. */
export type PoPageItem = PurchaseOrderItem & {
	pendingQaQty?: number;
	openQty?: number;
};
