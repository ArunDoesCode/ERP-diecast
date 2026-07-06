import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function QuotationsView() {
	const page = getPageDefinition("/quotations");

	if (!page) {
		throw new Error("Missing page definition for /quotations");
	}

	return <ModulePageShell page={page} />;
}
