import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function JobBoardView() {
	const page = getPageDefinition("/job-board");

	if (!page) {
		throw new Error("Missing page definition for /job-board");
	}

	return <ModulePageShell page={page} />;
}
