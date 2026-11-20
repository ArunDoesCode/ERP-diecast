"use client";

import { IconLayoutSidebar } from "@tabler/icons-react";

import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { UserMenu, type UserMenuProps } from "@/components/shell/UserMenu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Crumb } from "@/lib/shell/breadcrumbs";

export type TopBarProps = {
	crumbs: Crumb[];
	sidebarFolded: boolean;
	onToggleSidebar: () => void;
	user: UserMenuProps;
};

/** 44 px bar: fold button ("Fold sidebar" / "Unfold sidebar"), Breadcrumbs, disabled search stub (hint "/"), UserMenu. */
export function TopBar({
	crumbs,
	sidebarFolded,
	onToggleSidebar,
	user,
}: TopBarProps) {
	const foldLabel = sidebarFolded ? "Unfold sidebar" : "Fold sidebar";
	return (
		<header className="flex h-13 shrink-0 items-center gap-3 border-b bg-card px-3">
			<button
				type="button"
				aria-label={foldLabel}
				title={foldLabel}
				onClick={onToggleSidebar}
				className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<IconLayoutSidebar className="size-4" />
			</button>
			<div className="min-w-0 flex-1">
				<Breadcrumbs crumbs={crumbs} />
			</div>
			<div className="relative hidden w-56 md:block">
				<Label htmlFor="global-search" className="sr-only">
					Search
				</Label>
				<Input
					id="global-search"
					type="search"
					disabled
					placeholder="Search"
					className="pr-7"
				/>
				<kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1 text-xs text-muted-foreground">
					/
				</kbd>
			</div>
			<UserMenu {...user} />
		</header>
	);
}
