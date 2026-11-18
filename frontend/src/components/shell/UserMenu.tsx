import type { Density } from "@/lib/shell/density";

export type UserMenuProps = {
	name: string;
	role: string;
	density: Density;
	onDensityChange: (density: Density) => void;
	onLogout: () => void;
};

/** Trigger button (accessible name = user name) opens menu: name, role, theme switch, density switch, logout. */
export function UserMenu(_props: UserMenuProps) {
	return null;
}
