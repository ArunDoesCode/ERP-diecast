import {
	type Icon,
	IconArrowsExchange,
	IconChecklist,
	IconFileText,
	IconId,
	IconLayoutDashboard,
	IconPackage,
	IconSettings,
	IconShoppingCart,
	IconSitemap,
	IconStack2,
	IconUsers,
} from "@tabler/icons-react";

const ICONS: Record<string, Icon> = {
	landing: IconLayoutDashboard,
	"purchase-requisitions": IconFileText,
	approvals: IconChecklist,
	"purchase-orders": IconShoppingCart,
	suppliers: IconUsers,
	grn: IconPackage,
	inventory: IconStack2,
	subcontracting: IconArrowsExchange,
	bom: IconSitemap,
	"employee-directory": IconId,
	setup: IconSettings,
};

/** Route path (e.g. "/purchase-orders") -> Tabler icon. Unknown routes get a fallback icon. */
export function getNavIcon(path: string): Icon {
	const first = path.split("/").filter(Boolean)[0];
	if (!first) return IconLayoutDashboard;
	return ICONS[first] ?? IconFileText;
}
