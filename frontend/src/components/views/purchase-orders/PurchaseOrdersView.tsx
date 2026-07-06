import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function PurchaseOrdersView() {
	const page = getPageDefinition("/purchase-orders");

	if (!page) {
		throw new Error("Missing page definition for /purchase-orders");
	}

	return <ModulePageShell page={page} />;
}
