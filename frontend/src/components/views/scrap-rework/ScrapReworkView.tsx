import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function ScrapReworkView() {
	const page = getPageDefinition("/scrap-rework");

	if (!page) {
		throw new Error("Missing page definition for /scrap-rework");
	}

	return <ModulePageShell page={page} />;
}
