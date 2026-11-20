import { Suspense } from "react";

import { PurchaseRequisitionsView } from "@/components/views/purchase-requisitions/PurchaseRequisitionsView";

// The list keeps its filters in the URL (nuqs), which needs a Suspense boundary.
export default function PurchaseRequisitionsPage() {
	return (
		<Suspense fallback={null}>
			<PurchaseRequisitionsView />
		</Suspense>
	);
}
