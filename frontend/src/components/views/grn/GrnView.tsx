import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function GrnView() {
	const page = getPageDefinition("/grn");

	if (!page) {
		throw new Error("Missing page definition for /grn");
	}

	return <ModulePageShell page={page} />;
}
