import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function StepAssignmentView() {
	const page = getPageDefinition("/step-assignment");

	if (!page) {
		throw new Error("Missing page definition for /step-assignment");
	}

	return <ModulePageShell page={page} />;
}
