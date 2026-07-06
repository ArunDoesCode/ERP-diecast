import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function DispatchChallansView() {
	const page = getPageDefinition("/dispatch-challans");

	if (!page) {
		throw new Error("Missing page definition for /dispatch-challans");
	}

	return <ModulePageShell page={page} />;
}
