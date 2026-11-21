import type { PurchaseRequisitionItem } from "@/types/purchase-requisitions";

/** Contract step 2: getprdetails lines also carry the PO the line is on (BR-FF-43). */
export type PrPageItem = PurchaseRequisitionItem & {
	onPoId: number | null;
	onPoNumber: string | null;
	suggestedRatePaise: number | null;
};
