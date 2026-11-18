export type Density = "comfortable" | "compact";

export const DENSITY_STORAGE_KEY = "diecast.density";
export const DENSITY_ATTRIBUTE = "data-density";
export const DEFAULT_DENSITY: Density = "comfortable";

/** Reads the saved density; invalid / missing / no window -> DEFAULT_DENSITY. */
export function readDensity(): Density {
	if (typeof window === "undefined") return DEFAULT_DENSITY;
	try {
		const value = window.localStorage.getItem(DENSITY_STORAGE_KEY);
		return value === "compact" || value === "comfortable"
			? value
			: DEFAULT_DENSITY;
	} catch {
		return DEFAULT_DENSITY;
	}
}

function setAttribute(density: Density): void {
	document.documentElement.setAttribute(DENSITY_ATTRIBUTE, density);
}

/** Saves to localStorage and sets `data-density` on <html>. */
export function writeDensity(density: Density): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
	} catch {
		// storage blocked: still apply for this page view
	}
	setAttribute(density);
}

/** Sets `data-density` on <html> from the saved value (no write). Returns the applied value. */
export function applyDensity(): Density {
	const density = readDensity();
	if (typeof window !== "undefined") setAttribute(density);
	return density;
}

/** Inline script run before paint (root layout) so the saved density shows without a flash. */
export const DENSITY_INIT_SCRIPT = `try{var d=localStorage.getItem(${JSON.stringify(DENSITY_STORAGE_KEY)});document.documentElement.setAttribute(${JSON.stringify(DENSITY_ATTRIBUTE)},d==="compact"?"compact":"comfortable")}catch(e){}`;
