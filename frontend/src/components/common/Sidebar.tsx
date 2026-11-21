"use client";

import { IconBuildingFactory2 } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { useMeQuery } from "@/lib/api/auth/queries";
import { normalizeAllowedPath } from "@/lib/path-utils";
import { getNavIcon, getNavLabel } from "@/lib/shell/nav-icons";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";

export function NavSidebar() {
	const pathname = usePathname();

	const screens = useAuthSessionStore((state) => state.screens);
	const hasHydrated = useAuthSessionStore((state) => state.hasHydrated);

	// Restores the session on load (BR-AUTH-30): with no token in memory the client refreshes
	// through the httpOnly cookie first, and a failed refresh sends the user to /login
	// (refresh-token.ts), so a page that makes no other API call still checks the session.
	useMeQuery(true);

	// #51: sort and group only when the screens change, not on every render.
	const sidebarGroups = useMemo(() => {
		const sidebarPages = [...screens]
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((screen) => ({
				path: normalizeAllowedPath(screen.path),
				title: getNavLabel(normalizeAllowedPath(screen.path), screen.label),
				group: screen.menuGroup,
			}))
			.filter((page) => page.path)
			.filter(
				(page, index, pages) =>
					pages.findIndex((other) => other.path === page.path) === index,
			);
		return sidebarPages.reduce<{ name: string; pages: typeof sidebarPages }[]>(
			(groups, page) => {
				const existing = groups.find((group) => group.name === page.group);
				if (existing) existing.pages.push(page);
				else groups.push({ name: page.group, pages: [page] });
				return groups;
			},
			[],
		);
	}, [screens]);

	// Longest matching path wins, so /inventory/reorder does not also light up /inventory.
	const activePath = useMemo(() => {
		const matches = sidebarGroups
			.flatMap((group) => group.pages)
			.map((page) => page.path)
			.filter((path) => pathname === path || pathname.startsWith(`${path}/`));
		return matches.sort((a, b) => b.length - a.length)[0];
	}, [sidebarGroups, pathname]);

	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center gap-2 px-1 py-1.5">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
						<IconBuildingFactory2 className="size-4" />
					</span>
					<span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
						DiecastOS
					</span>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{!hasHydrated ? (
					<SidebarGroup>
						<SidebarGroupLabel>Navigation</SidebarGroupLabel>
						<SidebarGroupContent>
							<p className="px-2 py-1 text-sm text-muted-foreground">
								Loading...
							</p>
						</SidebarGroupContent>
					</SidebarGroup>
				) : sidebarGroups.length > 0 ? (
					sidebarGroups.map((group) => (
						<SidebarGroup key={group.name}>
							{group.name !== "" && (
								<SidebarGroupLabel className="text-sidebar-muted">
									{group.name}
								</SidebarGroupLabel>
							)}
							<SidebarGroupContent>
								<SidebarMenu>
									{group.pages.map((page) => {
										const isActive = page.path === activePath;

										const NavIcon = getNavIcon(page.path);
										return (
											<SidebarMenuItem key={page.path}>
												<SidebarMenuButton
													asChild
													isActive={isActive}
													tooltip={page.title}
													className="relative data-active:font-bold data-active:before:absolute data-active:before:inset-y-1 data-active:before:left-0 data-active:before:w-[3px] data-active:before:rounded-r data-active:before:bg-sidebar-primary data-active:before:content-['']"
												>
													<Link
														href={page.path}
														aria-current={isActive ? "page" : undefined}
													>
														<NavIcon />
														<span>{page.title}</span>
													</Link>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))
				) : (
					<SidebarGroup>
						<SidebarGroupLabel>Navigation</SidebarGroupLabel>
						<SidebarGroupContent>
							<p className="px-2 py-1 text-sm text-muted-foreground">
								No allowed pages found.
							</p>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarRail />
		</Sidebar>
	);
}
