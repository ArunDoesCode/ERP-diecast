import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";

import type { Crumb } from "@/lib/shell/breadcrumbs";

export type BreadcrumbsProps = {
	/** Rendered as `nav` (aria-label "Breadcrumb") > `ol`; last item `aria-current="page"`. */
	crumbs: Crumb[];
};

export function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
	return (
		<nav aria-label="Breadcrumb" className="min-w-0">
			<ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
				{crumbs.map((crumb, index) => {
					const isLast = index === crumbs.length - 1;
					return (
						<li
							key={`${crumb.label}-${index}`}
							className="flex min-w-0 items-center gap-1"
						>
							{index > 0 && (
								<IconChevronRight aria-hidden="true" className="size-3.5" />
							)}
							{isLast ? (
								<span
									aria-current="page"
									className="truncate font-medium text-foreground"
								>
									{crumb.label}
								</span>
							) : crumb.href ? (
								<Link
									href={crumb.href}
									className="truncate hover:text-foreground"
								>
									{crumb.label}
								</Link>
							) : (
								<span className="truncate">{crumb.label}</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
