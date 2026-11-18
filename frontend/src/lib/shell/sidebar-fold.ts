export const SIDEBAR_FOLD_STORAGE_KEY = "diecast.sidebar.folded";

/** true = folded to icons. Missing / invalid / no window -> false. */
export function readSidebarFolded(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(SIDEBAR_FOLD_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

export function writeSidebarFolded(folded: boolean): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(SIDEBAR_FOLD_STORAGE_KEY, String(folded));
	} catch {
		// storage blocked: fold still works for this page view
	}
}
