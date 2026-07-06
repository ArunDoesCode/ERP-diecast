import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function SparePartsView() {
	const page = getPageDefinition("/spare-parts");

	if (!page) {
		throw new Error("Missing page definition for /spare-parts");
	}

	return <ModulePageShell page={page} />;
}
