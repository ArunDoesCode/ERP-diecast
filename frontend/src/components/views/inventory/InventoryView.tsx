import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function InventoryView() {
	const page = getPageDefinition("/inventory");

	if (!page) {
		throw new Error("Missing page definition for /inventory");
	}

	return <ModulePageShell page={page} />;
}
