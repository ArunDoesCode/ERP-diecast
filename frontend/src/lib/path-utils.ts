export function normalizeAllowedPath(path: string) {
	if (!path) {
		return "";
	}

	if (path === "/") {
		return "/";
	}

	const normalized = path.startsWith("/") ? path : `/${path}`;
	return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function formatPageTitle(path: string) {
	const normalized = normalizeAllowedPath(path);
	if (!normalized || normalized === "/") {
		return "Home";
	}

	const lastSegment = normalized.split("/").filter(Boolean).pop() ?? normalized;
	return lastSegment
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function buildShellPage(path: string, description?: string) {
	const normalizedPath = normalizeAllowedPath(path);
	return {
		path: normalizedPath,
		title: formatPageTitle(normalizedPath),
		description,
	};
}
