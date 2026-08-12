import { ModulePageShell } from "@/components/common/ModulePageShell";
import { buildShellPage } from "@/lib/path-utils";

export function EmployeeDirectoryView() {
	const page = buildShellPage("/employee-directory");
	return <ModulePageShell page={page} />;
}
