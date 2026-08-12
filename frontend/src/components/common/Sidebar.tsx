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
import { formatPageTitle, normalizeAllowedPath } from "@/lib/path-utils";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import { Button } from "../ui/button";
import { ModeToggle } from "../ui/mode-toggle";

export function NavSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const logoutMutation = useLogoutMutation();

	const token = useAuthSessionStore((state) => state.token);
	const role = useAuthSessionStore((state) => state.role);
	const allowedPages = useAuthSessionStore((state) => state.allowedPages);
	const hasHydrated = useAuthSessionStore((state) => state.hasHydrated);

	useMeQuery(Boolean(token) && hasHydrated);

	const sidebarPages = allowedPages
		.map((path) => normalizeAllowedPath(path))
		.filter(Boolean)
		.filter((path, index, paths) => paths.indexOf(path) === index)
		.map((path) => ({
			path,
			title: formatPageTitle(path),
		}));

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
				) : sidebarPages.length > 0 ? (
					<SidebarGroup>
						<SidebarGroupLabel>Navigation</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{sidebarPages.map((page) => {
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
