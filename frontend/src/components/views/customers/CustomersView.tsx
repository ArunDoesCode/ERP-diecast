import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function CustomersView() {
	const page = getPageDefinition("/customers");

	if (!page) {
		throw new Error("Missing page definition for /customers");
	}

	return <ModulePageShell page={page} />;
}
