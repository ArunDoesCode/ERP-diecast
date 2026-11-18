"use client";

import { IconLogout } from "@tabler/icons-react";
import { useTheme } from "next-themes";

import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Density } from "@/lib/shell/density";

export type UserMenuProps = {
	name: string;
	role: string;
	density: Density;
	onDensityChange: (density: Density) => void;
	onLogout: () => void;
};

function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0].charAt(0);
	const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
	return (first + last).toUpperCase();
}

/** Trigger button (accessible name = user name) opens menu: name, role, theme switch, density switch, logout. */
export function UserMenu({
	name,
	role,
	density,
	onDensityChange,
	onLogout,
}: UserMenuProps) {
	const { setTheme, resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 rounded-md p-1 text-xs hover:bg-accent"
				>
					<span
						aria-hidden="true"
						className="flex size-6 items-center justify-center rounded-full bg-brand-accent text-[11px] font-semibold text-brand-accent-foreground"
					>
						{initialsOf(name)}
					</span>
					<span className="hidden font-medium sm:inline">{name}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="flex flex-col gap-0.5">
					<span className="text-xs font-semibold">{name}</span>
					<span className="text-xs font-normal text-muted-foreground">
						Role: {role}
					</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem
					checked={isDark}
					onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
				>
					Dark mode
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={density === "compact"}
					onCheckedChange={(checked) =>
						onDensityChange(checked ? "compact" : "comfortable")
					}
				>
					Compact
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onLogout}>
					<IconLogout />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
