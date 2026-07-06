import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function DieDesignTasksView() {
	const page = getPageDefinition("/die-design-tasks");

	if (!page) {
		throw new Error("Missing page definition for /die-design-tasks");
	}

	return <ModulePageShell page={page} />;
}
