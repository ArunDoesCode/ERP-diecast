import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function PnlStatementView() {
	const page = getPageDefinition("/pnl-statement");

	if (!page) {
		throw new Error("Missing page definition for /pnl-statement");
	}

	return <ModulePageShell page={page} />;
}
