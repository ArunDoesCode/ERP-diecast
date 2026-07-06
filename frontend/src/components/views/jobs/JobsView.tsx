import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function JobsView() {
	const page = getPageDefinition("/jobs");

	if (!page) {
		throw new Error("Missing page definition for /jobs");
	}

	return <ModulePageShell page={page} />;
}
