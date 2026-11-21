import {
	type Icon,
	IconArrowsExchange,
	IconArrowsRightLeft,
	IconChecklist,
	IconClipboardList,
	IconFileCertificate,
	IconFileInvoice,
	IconFileSearch,
	IconFileText,
	IconId,
	IconLayoutDashboard,
	IconPackage,
	IconPackageExport,
	IconReceipt,
	IconSettings,
	IconShoppingCart,
	IconSitemap,
	IconStack2,
	IconStarHalf,
	IconTruckDelivery,
	IconUserCircle,
	IconUsers,
} from "@tabler/icons-react";

const ICONS: Record<string, Icon> = {
	landing: IconLayoutDashboard,
	"purchase-requisitions": IconFileText,
	approvals: IconChecklist,
	"purchase-orders": IconShoppingCart,
	suppliers: IconUsers,
	"supplier-ratings": IconStarHalf,
	grn: IconPackage,
	"purchase-returns": IconPackageExport,
	"supplier-invoices": IconFileInvoice,
	rfq: IconFileSearch,
	"rate-contracts": IconFileCertificate,
	inventory: IconStack2,
	subcontracting: IconArrowsExchange,
	bom: IconSitemap,
	"sale-orders": IconReceipt,
	"delivery-notes": IconTruckDelivery,
	customers: IconUserCircle,
	"employee-directory": IconId,
	setup: IconSettings,
};

/** Nested screens that must not share their parent's icon (Reorder keeps the Inventory icon). */
const NESTED_ICONS: Record<string, Icon> = {
	"/inventory/stock-transfers": IconArrowsRightLeft,
	"/delivery-notes/pending": IconClipboardList,
};

/** Sidebar labels shown in sentence case when the screen list sends title case. */
const NAV_LABELS: Record<string, string> = {
	"/inventory/stock-transfers": "Stock transfers",
	"/supplier-ratings": "Supplier rating",
};

export function getNavLabel(path: string, label: string): string {
	return NAV_LABELS[path] ?? label;
}

/** Route path (e.g. "/purchase-orders") -> Tabler icon. Unknown routes get a fallback icon. */
export function getNavIcon(path: string): Icon {
	const nested = NESTED_ICONS[path];
	if (nested) return nested;
	const first = path.split("/").filter(Boolean)[0];
	if (!first) return IconLayoutDashboard;
	return ICONS[first] ?? IconFileText;
}
