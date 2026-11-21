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
	"purchase-requisitions": "Purchase requisitions",
	approvals: "Approvals",
	"purchase-orders": "Purchase orders",
	suppliers: "Suppliers",
	grn: "Goods receipt",
	"purchase-returns": "Purchase returns",
	"supplier-invoices": "Supplier invoices",
	rfq: "Requests for quotation",
	"rate-contracts": "Rate contracts",
	inventory: "Inventory",
	subcontracting: "Subcontracting",
	bom: "Bills of materials",
	"sale-orders": "Sale orders",
	customers: "Customers",
	"employee-directory": "Employee directory",
	setup: "Setup",
};

function labelFor(segment: string): string {
	const known = LIST_LABELS[segment];
	if (known) return known;
	const words = segment.replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Route + optional group / document number -> crumbs. Last crumb has no href. */
export function buildBreadcrumbs(
	pathname: string,
	options?: BreadcrumbOptions,
): Crumb[] {
	const segments = pathname.split("/").filter(Boolean);
	const crumbs: Crumb[] = [];
	if (segments[0] === "inventory" && segments[1] === "reorder") {
		// Nested screen: Inventory > Reorder > (Reorder runs >) run.
		crumbs.push(
			{ label: LIST_LABELS.inventory, href: "/inventory" },
			{ label: "Reorder", href: "/inventory/reorder" },
		);
		if (segments[2] === "runs") {
			crumbs.push({ label: "Reorder runs", href: "/inventory/reorder/runs" });
			if (segments.length > 3) {
				crumbs.push({ label: options?.docNumber ?? "Details" });
			}
		}
		delete crumbs[crumbs.length - 1].href;
		return crumbs;
	}
	if (segments[0] === "inventory" && segments[1] === "stock-transfers") {
		// Inventory > Stock transfers > (New transfer | ST no. > Edit).
		crumbs.push(
			{ label: LIST_LABELS.inventory, href: "/inventory" },
			{ label: "Stock transfers", href: "/inventory/stock-transfers" },
		);
		if (segments[2] === "new") {
			crumbs.push({ label: "New transfer" });
		} else if (segments.length > 2) {
			if (segments[3] === "edit") {
				crumbs.push(
					{
						label: options?.docNumber ?? "Details",
						href: `/inventory/stock-transfers/${segments[2]}`,
					},
					{ label: "Edit" },
				);
			} else {
				crumbs.push({ label: options?.docNumber ?? "Details" });
			}
		}
		delete crumbs[crumbs.length - 1].href;
		return crumbs;
	}
	if (segments[0] === "inventory" && segments.length > 1) {
		// Inventory > Stock | Movements | Locations | Items … (> doc / Details).
		crumbs.push(
			{ label: LIST_LABELS.inventory, href: "/inventory" },
			{ label: labelFor(segments[1]), href: `/inventory/${segments[1]}` },
		);
		if (segments.length > 2) {
			crumbs.push({ label: options?.docNumber ?? "Details" });
		}
		delete crumbs[crumbs.length - 1].href;
		return crumbs;
	}
	if (
		segments[0] === "rfq" &&
		segments.length > 2 &&
		/^\d+$/.test(segments[1])
	) {
		// Nested RFQ screens: RFQ > RFQ no. > Compare / Quote / Print.
		const leaf: Record<string, string> = {
			compare: "Compare",
			quotes: "Quote",
			print: "Print",
			edit: "Edit",
		};
		if (options?.group) crumbs.push({ label: options.group });
		crumbs.push(
			{ label: LIST_LABELS.rfq, href: "/rfq" },
			{ label: options?.docNumber ?? "Details", href: `/rfq/${segments[1]}` },
			{ label: leaf[segments[2]] ?? labelFor(segments[2]) },
		);
		delete crumbs[crumbs.length - 1].href;
		return crumbs;
	}
	if (options?.group) crumbs.push({ label: options.group });
	if (segments.length === 0) {
		crumbs.push({ label: LIST_LABELS.landing });
	} else {
		crumbs.push({ label: labelFor(segments[0]), href: `/${segments[0]}` });
		if (segments.length > 1) {
			crumbs.push({ label: options?.docNumber ?? "Details" });
		}
	}
	const last = crumbs[crumbs.length - 1];
	delete last.href;
	return crumbs;
}
