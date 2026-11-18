export const SIDEBAR_FOLD_STORAGE_KEY = "diecast.sidebar.folded";

/** true = folded to icons. Missing / invalid / no window -> false. */
export function readSidebarFolded(): boolean {
	throw new Error("not implemented");
}

export function writeSidebarFolded(_folded: boolean): void {
	throw new Error("not implemented");
}
