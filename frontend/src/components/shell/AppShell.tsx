"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { NavSidebar } from "@/components/common/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useLogoutMutation } from "@/lib/api/auth/queries";
import { normalizeAllowedPath } from "@/lib/path-utils";
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
	const crumbs = buildBreadcrumbs(pathname, {
		group: group || undefined,
	});

	return (
		<SidebarProvider
			open={!folded}
			onOpenChange={(open) => changeFolded(!open)}
			style={{ "--sidebar-width-icon": "52px" } as React.CSSProperties}
		>
			<NavSidebar />
			<SidebarInset>
				<TopBar
					crumbs={crumbs}
					sidebarFolded={folded}
					onToggleSidebar={() => changeFolded(!folded)}
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
				/>
				<div className="p-5">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
