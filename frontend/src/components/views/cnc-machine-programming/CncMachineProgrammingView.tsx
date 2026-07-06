import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function CncMachineProgrammingView() {
	const page = getPageDefinition("/cnc-machine-programming");

	if (!page) {
		throw new Error("Missing page definition for /cnc-machine-programming");
	}

	return <ModulePageShell page={page} />;
}
