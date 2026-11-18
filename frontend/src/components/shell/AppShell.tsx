"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { NavSidebar } from "@/components/common/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import type { UserMenuProps } from "@/components/shell/UserMenu";
import {
	SidebarInset,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { useLogoutMutation } from "@/lib/api/auth/queries";
import { normalizeAllowedPath } from "@/lib/path-utils";
import {
	BreadcrumbLastProvider,
	useBreadcrumbLastLabel,
} from "@/lib/shell/breadcrumb-last";
import { buildBreadcrumbs } from "@/lib/shell/breadcrumbs";
import {
	DEFAULT_DENSITY,
	type Density,
	readDensity,
	writeDensity,
} from "@/lib/shell/density";
import {
	readSidebarFolded,
	writeSidebarFolded,
} from "@/lib/shell/sidebar-fold";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";

/** Protected-area frame: sidebar + 44 px top bar + content. Holds the fold and density preferences. */
export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const logoutMutation = useLogoutMutation();
	const userName = useAuthSessionStore((state) => state.userName);
	const role = useAuthSessionStore((state) => state.role);
	const screens = useAuthSessionStore((state) => state.screens);

	const [folded, setFolded] = useState(false);
	const [density, setDensity] = useState<Density>(DEFAULT_DENSITY);

	// Saved preferences live in localStorage; read after mount so server and client markup match.
	useEffect(() => {
		setFolded(readSidebarFolded());
		setDensity(readDensity());
	}, []);

	const changeFolded = (next: boolean) => {
		setFolded(next);
		writeSidebarFolded(next);
	};
	const changeDensity = (next: Density) => {
		setDensity(next);
		writeDensity(next);
	};

	const firstSegment = pathname.split("/").filter(Boolean)[0];
	const group = screens.find((screen) => {
		const path = normalizeAllowedPath(screen.path);
		return path && path.split("/").filter(Boolean)[0] === firstSegment;
	})?.menuGroup;

	return (
		<BreadcrumbLastProvider>
			<SidebarProvider
				open={!folded}
				onOpenChange={(open) => changeFolded(!open)}
				style={{ "--sidebar-width-icon": "52px" } as React.CSSProperties}
			>
				<ShellFrame
					pathname={pathname}
					group={group || undefined}
					folded={folded}
					user={{
						name: userName ?? "User",
						role: role ?? "-",
						density,
						onDensityChange: changeDensity,
						onLogout: () => {
							logoutMutation.mutate(undefined, {
								onSettled: () => {
									router.replace("/login");
								},
							});
						},
					}}
				>
					{children}
				</ShellFrame>
			</SidebarProvider>
		</BreadcrumbLastProvider>
	);
}

type ShellFrameProps = {
	pathname: string;
	group: string | undefined;
	folded: boolean;
	user: UserMenuProps;
	children: ReactNode;
};

/** Lives inside SidebarProvider so the fold button drives desktop collapse and the mobile sheet alike. */
function ShellFrame({
	pathname,
	group,
	folded,
	user,
	children,
}: ShellFrameProps) {
	const { toggleSidebar } = useSidebar();
	const docNumber = useBreadcrumbLastLabel();
	const crumbs = buildBreadcrumbs(pathname, { group, docNumber });
	return (
		<>
			<NavSidebar />
			<SidebarInset>
				<TopBar
					crumbs={crumbs}
					sidebarFolded={folded}
					onToggleSidebar={toggleSidebar}
					user={user}
				/>
				<div className="p-5">{children}</div>
			</SidebarInset>
		</>
	);
}
