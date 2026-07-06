import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function InwardInspectionView() {
	const page = getPageDefinition("/inward-inspection");

	if (!page) {
		throw new Error("Missing page definition for /inward-inspection");
	}

	return <ModulePageShell page={page} />;
}
