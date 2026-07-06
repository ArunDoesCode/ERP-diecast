import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function SuppliersView() {
	const page = getPageDefinition("/suppliers");

	if (!page) {
		throw new Error("Missing page definition for /suppliers");
	}

	return <ModulePageShell page={page} />;
}
