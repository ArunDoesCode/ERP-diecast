import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function CustomerInvoicesView() {
	const page = getPageDefinition("/customer-invoices");

	if (!page) {
		throw new Error("Missing page definition for /customer-invoices");
	}

	return <ModulePageShell page={page} />;
}
