import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function ExpensesView() {
	const page = getPageDefinition("/expenses");

	if (!page) {
		throw new Error("Missing page definition for /expenses");
	}

	return <ModulePageShell page={page} />;
}
