import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function InProcessInspectionView() {
	const page = getPageDefinition("/in-process-inspection");

	if (!page) {
		throw new Error("Missing page definition for /in-process-inspection");
	}

	return <ModulePageShell page={page} />;
}
