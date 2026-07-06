import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function DieLoadingView() {
	const page = getPageDefinition("/die-loading");

	if (!page) {
		throw new Error("Missing page definition for /die-loading");
	}

	return <ModulePageShell page={page} />;
}
