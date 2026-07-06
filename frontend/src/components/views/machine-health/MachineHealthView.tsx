import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function MachineHealthView() {
	const page = getPageDefinition("/machine-health");

	if (!page) {
		throw new Error("Missing page definition for /machine-health");
	}

	return <ModulePageShell page={page} />;
}
