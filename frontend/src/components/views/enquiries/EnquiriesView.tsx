import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function EnquiriesView() {
	const page = getPageDefinition("/enquiries");

	if (!page) {
		throw new Error("Missing page definition for /enquiries");
	}

	return <ModulePageShell page={page} />;
}
