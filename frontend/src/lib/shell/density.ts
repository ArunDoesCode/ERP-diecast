export type Density = "comfortable" | "compact";

export const DENSITY_STORAGE_KEY = "diecast.density";
export const DENSITY_ATTRIBUTE = "data-density";
export const DEFAULT_DENSITY: Density = "comfortable";

/** Reads the saved density; invalid / missing / no window -> DEFAULT_DENSITY. */
export function readDensity(): Density {
	throw new Error("not implemented");
}

/** Saves to localStorage and sets `data-density` on <html>. */
export function writeDensity(_density: Density): void {
	throw new Error("not implemented");
}

/** Sets `data-density` on <html> from the saved value (no write). Returns the applied value. */
export function applyDensity(): Density {
	throw new Error("not implemented");
}
