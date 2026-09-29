"use client";

import { IconLogout } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { useLogoutMutation, useMeQuery } from "@/lib/api/auth/queries";
import { normalizeAllowedPath } from "@/lib/path-utils";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import { Button } from "../ui/button";
import { ModeToggle } from "../ui/mode-toggle";

export function NavSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const logoutMutation = useLogoutMutation();

	const token = useAuthSessionStore((state) => state.token);
	const role = useAuthSessionStore((state) => state.role);
	const screens = useAuthSessionStore((state) => state.screens);
	const hasHydrated = useAuthSessionStore((state) => state.hasHydrated);

	useMeQuery(Boolean(token) && hasHydrated);

	const sidebarPages = [...screens]
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((screen) => ({
			path: normalizeAllowedPath(screen.path),
			title: screen.label,
			group: screen.menuGroup,
		}))
		.filter((page) => page.path)
		.filter(
			(page, index, pages) =>
				pages.findIndex((other) => other.path === page.path) === index,
		);
	const sidebarGroups = sidebarPages.reduce<
		{ name: string; pages: typeof sidebarPages }[]
	>((groups, page) => {
		const existing = groups.find((group) => group.name === page.group);
		if (existing) existing.pages.push(page);
		else groups.push({ name: page.group, pages: [page] });
		return groups;
	}, []);

	return (
		<Sidebar variant="inset" className="w-60">
			<SidebarHeader>
				<div className="px-2 py-1.5 text-sm font-semibold">
					{" "}
					{role ? `Role: ${role}` : "Role: -"}
				</div>
			</SidebarHeader>

			<SidebarContent>
				{!hasHydrated ? (
					<SidebarGroup>
						<SidebarGroupLabel>Navigation</SidebarGroupLabel>
						<SidebarGroupContent>
							<p className="px-2 py-1 text-xs text-muted-foreground">
								Loading...
							</p>
						</SidebarGroupContent>
					</SidebarGroup>
				) : sidebarGroups.length > 0 ? (
					sidebarGroups.map((group) => (
						<SidebarGroup key={group.name}>
							<SidebarGroupLabel>{group.name}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{group.pages.map((page) => {
										const isActive =
											pathname === page.path ||
											pathname.startsWith(`${page.path}/`);

										return (
											<SidebarMenuItem key={page.path}>
												<SidebarMenuButton
													asChild
													isActive={isActive}
													tooltip={page.title}
												>
													<Link href={page.path}>
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
							<p className="px-2 py-1 text-xs text-muted-foreground">
								No allowed pages found.
							</p>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarFooter>
				<div className="px-2 pb-1 text-xs text-muted-foreground"></div>
				<SidebarMenu>
					<SidebarMenuItem className="flex justify-between items-center">
						<Button
							onClick={() => {
								logoutMutation.mutate(undefined, {
									onSettled: () => {
										router.replace("/login");
									},
								});
							}}
							disabled={logoutMutation.isPending}
						>
							<IconLogout />
							<span>
								{logoutMutation.isPending ? "Logging out..." : "Logout"}
							</span>
						</Button>
						<div>
							<ModeToggle />
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
