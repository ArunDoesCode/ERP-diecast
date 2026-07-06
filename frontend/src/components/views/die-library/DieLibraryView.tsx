import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function DieLibraryView() {
	const page = getPageDefinition("/die-library");

	if (!page) {
		throw new Error("Missing page definition for /die-library");
	}

	return <ModulePageShell page={page} />;
}
