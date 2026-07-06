import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function VendorBillsView() {
	const page = getPageDefinition("/vendor-bills");

	if (!page) {
		throw new Error("Missing page definition for /vendor-bills");
	}

	return <ModulePageShell page={page} />;
}
