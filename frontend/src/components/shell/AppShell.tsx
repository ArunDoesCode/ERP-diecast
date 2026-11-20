"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { NavSidebar } from "@/components/common/Sidebar";
import { SIDEBAR_FOLDED_ATTRIBUTE } from "@/components/shell/sidebar-fold-init";
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

// Screens with no permission key: open to every signed-in user (BR-AUTH-15).
const ALWAYS_ALLOWED_PATHS = ["/home", "/landing", "/approvals"];

function isPathAllowed(pathname: string, allowedPaths: string[]) {
	const path = normalizeAllowedPath(pathname);
	return allowedPaths.some((allowedPath) => {
		const allowed = normalizeAllowedPath(allowedPath);
		if (!allowed) return false;
		if (allowed === "/") return path === "/";
		return path === allowed || path.startsWith(`${allowed}/`);
	});
}

/** Protected-area frame: sidebar + 44 px top bar + content. Holds the fold and density preferences. */
export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const logoutMutation = useLogoutMutation();
	const userName = useAuthSessionStore((state) => state.userName);
	const role = useAuthSessionStore((state) => state.role);
	const screens = useAuthSessionStore((state) => state.screens);
	const sessionReady = useAuthSessionStore(
		(state) => state.hasHydrated && state.userId !== null,
	);

	const [folded, setFolded] = useState(false);
	// The menu's density switch is not in the server markup (closed menu), so it can start from
	// the saved value; the page density itself is set before paint by the root layout script.
	const [density, setDensity] = useState<Density>(() =>
		typeof window === "undefined" ? DEFAULT_DENSITY : readDensity(),
	);

	// The server markup is always unfolded; the root layout script marks <html> before paint so
	// CSS shows the saved fold until this state catches up (#107).
	useEffect(() => {
		setFolded(readSidebarFolded());
	}, []);

	// BR-AUTH-30: the page guard only checks the refresh cookie; screen access is checked here,
	// once the session is restored. The API still decides every request (BR-AUTH-14).
	useEffect(() => {
		if (!sessionReady) return;
		const allowed = [
			...ALWAYS_ALLOWED_PATHS,
			...screens.map((screen) => screen.path),
		];
		if (!isPathAllowed(pathname, allowed)) router.replace("/home");
	}, [sessionReady, screens, pathname, router]);

	const changeFolded = (next: boolean) => {
		setFolded(next);
		writeSidebarFolded(next);
		document.documentElement.toggleAttribute(SIDEBAR_FOLDED_ATTRIBUTE, next);
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
						loggingOut: logoutMutation.isPending,
						onLogout: () => {
							// #107: one call only, even on a double click.
							if (logoutMutation.isPending) return;
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
			<SidebarInset className="min-w-0">
				<TopBar
					crumbs={crumbs}
					sidebarFolded={folded}
					onToggleSidebar={toggleSidebar}
					user={user}
				/>
				<div className="p-6">{children}</div>
			</SidebarInset>
		</>
	);
}
