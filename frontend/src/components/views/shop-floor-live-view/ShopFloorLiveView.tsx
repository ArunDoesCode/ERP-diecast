import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function ShopFloorLiveView() {
	const page = getPageDefinition("/shop-floor-live-view");

	if (!page) {
		throw new Error("Missing page definition for /shop-floor-live-view");
	}

	return <ModulePageShell page={page} />;
}
