import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function FinalInspectionView() {
	const page = getPageDefinition("/final-inspection");

	if (!page) {
		throw new Error("Missing page definition for /final-inspection");
	}

	return <ModulePageShell page={page} />;
}
