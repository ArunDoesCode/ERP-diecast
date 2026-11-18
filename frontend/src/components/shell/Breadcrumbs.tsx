import type { Crumb } from "@/lib/shell/breadcrumbs";

export type BreadcrumbsProps = {
	/** Rendered as `nav` (aria-label "Breadcrumb") > `ol`; last item `aria-current="page"`. */
	crumbs: Crumb[];
};

export function Breadcrumbs(_props: BreadcrumbsProps) {
	return null;
}
