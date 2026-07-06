import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function TrialRunLogsView() {
	const page = getPageDefinition("/trial-run-logs");

	if (!page) {
		throw new Error("Missing page definition for /trial-run-logs");
	}

	return <ModulePageShell page={page} />;
}
