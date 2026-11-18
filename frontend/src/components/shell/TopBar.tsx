import type { Crumb } from "@/lib/shell/breadcrumbs";
import type { UserMenuProps } from "./UserMenu";

export type TopBarProps = {
	crumbs: Crumb[];
	sidebarFolded: boolean;
	onToggleSidebar: () => void;
	user: UserMenuProps;
};

/** 44 px bar: fold button ("Fold sidebar" / "Unfold sidebar"), Breadcrumbs, disabled search stub (hint "/"), UserMenu. */
export function TopBar(_props: TopBarProps) {
	return null;
}
