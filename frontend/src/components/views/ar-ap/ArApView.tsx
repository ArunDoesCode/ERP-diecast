import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function ArApView() {
	const page = getPageDefinition("/ar-ap");

	if (!page) {
		throw new Error("Missing page definition for /ar-ap");
	}

	return <ModulePageShell page={page} />;
}
