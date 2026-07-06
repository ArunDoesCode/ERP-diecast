import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function SalesOrdersView() {
	const page = getPageDefinition("/sales-orders");

	if (!page) {
		throw new Error("Missing page definition for /sales-orders");
	}

	return <ModulePageShell page={page} />;
}
