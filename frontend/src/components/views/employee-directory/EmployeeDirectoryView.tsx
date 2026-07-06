import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function EmployeeDirectoryView() {
	const page = getPageDefinition("/employee-directory");

	if (!page) {
		throw new Error("Missing page definition for /employee-directory");
	}

	return <ModulePageShell page={page} />;
}
