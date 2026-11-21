import { Suspense } from "react";

import { PurchaseOrdersView } from "@/components/views/purchase-orders/PurchaseOrdersView";

// The list keeps its filters in the URL (nuqs), which needs a Suspense boundary.
export default function PurchaseOrdersPage() {
	return (
		<Suspense fallback={null}>
			<PurchaseOrdersView />
		</Suspense>
	);
}
