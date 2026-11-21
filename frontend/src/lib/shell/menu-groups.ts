export type MenuPage = { group: string };

export type MenuGroup<P extends MenuPage> = { name: string; pages: P[] };

// BR-FF-100: General first, Admin last, every other group in order of its first screen.
function groupRank(name: string): number {
	if (name === "General") return 0;
	if (name === "Admin") return 2;
	return 1;
}

/** Pages must already be sorted by sortOrder; groups form by first appearance, then rank. */
export function buildMenuGroups<P extends MenuPage>(
	pages: P[],
): MenuGroup<P>[] {
	const groups = pages.reduce<MenuGroup<P>[]>((acc, page) => {
		const existing = acc.find((group) => group.name === page.group);
		if (existing) existing.pages.push(page);
		else acc.push({ name: page.group, pages: [page] });
		return acc;
	}, []);
	// Array.prototype.sort is stable, so equal ranks keep first-appearance order.
	return groups.sort((a, b) => groupRank(a.name) - groupRank(b.name));
}
