export type Crumb = {
	label: string;
	/** Absent on the last crumb (current page, rendered as text). */
	href?: string;
};

export type BreadcrumbOptions = {
	/** Sidebar menu group of the route's screen, e.g. "Purchase". Becomes the first crumb (no link). */
	group?: string;
	/** Document number for detail routes, e.g. "PO-2026-0187". Used as the last crumb. */
	docNumber?: string;
};

const LIST_LABELS: Record<string, string> = {
	landing: "Home",
	home: "Home",
	"purchase-requisitions": "Purchase requisitions",
	approvals: "Approvals",
	"purchase-orders": "Purchase orders",
	suppliers: "Suppliers",
	grn: "Goods receipt",
	inventory: "Inventory",
	subcontracting: "Subcontracting",
	"employee-directory": "Employee directory",
	setup: "Setup",
};

function labelFor(segment: string): string {
	const known = LIST_LABELS[segment];
	if (known) return known;
	const words = segment.replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Screens that are not documents: name them instead of "Details". */
function screenLabel(segments: string[]): string | undefined {
	const [root, second, third] = segments;
	if (second === "new") {
		if (root === "purchase-requisitions") return "New requisition";
		if (root === "grn") return "Receive goods";
	}
	if (root === "purchase-requisitions" && third === "edit")
		return "Edit requisition";
	if (root === "purchase-orders" && third === "edit") return "Edit order";
	if (root === "grn" && second === "receive") return "Choose order";
	return undefined;
}

/** Route + optional group / document number -> crumbs. Last crumb has no href. */
export function buildBreadcrumbs(
	pathname: string,
	options?: BreadcrumbOptions,
): Crumb[] {
	const segments = pathname.split("/").filter(Boolean);
	const crumbs: Crumb[] = [];
	if (options?.group) crumbs.push({ label: options.group });
	if (segments.length === 0) {
		crumbs.push({ label: LIST_LABELS.landing });
	} else {
		crumbs.push({ label: labelFor(segments[0]), href: `/${segments[0]}` });
		if (segments.length > 1) {
			crumbs.push({
				label: options?.docNumber ?? screenLabel(segments) ?? "Details",
			});
		}
	}
	const last = crumbs[crumbs.length - 1];
	delete last.href;
	return crumbs;
}
