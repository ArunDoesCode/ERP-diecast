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

/** Route + optional group / document number -> crumbs. Last crumb has no href. */
export function buildBreadcrumbs(
	_pathname: string,
	_options?: BreadcrumbOptions,
): Crumb[] {
	throw new Error("not implemented");
}
