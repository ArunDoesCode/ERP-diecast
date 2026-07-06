import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function MachineConfigView() {
	const page = getPageDefinition("/machine-config");

	if (!page) {
		throw new Error("Missing page definition for /machine-config");
	}

	return <ModulePageShell page={page} />;
}
