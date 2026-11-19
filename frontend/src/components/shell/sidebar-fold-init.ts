import { SIDEBAR_FOLD_STORAGE_KEY } from "@/lib/shell/sidebar-fold";

/** Set on <html> while the sidebar is folded; lets CSS show the fold before React hydrates (#107). */
export const SIDEBAR_FOLDED_ATTRIBUTE = "data-sidebar-folded";

/** Inline script run before paint (root layout): marks <html> when the saved fold is "folded". */
export const SIDEBAR_FOLD_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_FOLD_STORAGE_KEY)})==="true")document.documentElement.setAttribute(${JSON.stringify(SIDEBAR_FOLDED_ATTRIBUTE)},"")}catch(e){}`;

/**
 * Until React applies the saved fold, the server markup shows the sidebar open. While <html>
 * carries the attribute, narrow it to the icon rail and hide its text, so a folded sidebar never
 * flashes open on a full page load. Once React folds it, these rules match what it renders.
 */
export const SIDEBAR_FOLD_INIT_STYLE = `html[${SIDEBAR_FOLDED_ATTRIBUTE}] [data-slot="sidebar-wrapper"]{--sidebar-width:var(--sidebar-width-icon)!important}html[${SIDEBAR_FOLDED_ATTRIBUTE}] [data-slot="sidebar"][data-state="expanded"] :is([data-sidebar="group-label"],[data-sidebar="menu-button"] span,[data-slot="sidebar-header"] span.truncate){display:none}`;
