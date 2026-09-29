"use client";

import { useState } from "react";

import { ScreenRolesDialog } from "@/components/pages/setup/screens/ScreenRolesDialog";
import { ScreenRow } from "@/components/pages/setup/screens/ScreenRow";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useScreensQuery } from "@/lib/api/setup/queries";
import type { Screen } from "@/types/setup";

export function ScreensTab() {
	const screensQuery = useScreensQuery();
	const [screenForRoles, setScreenForRoles] = useState<Screen | null>(null);
	const screens = screensQuery.data?.data ?? [];

	if (screensQuery.isLoading) return <Skeleton className="h-40 w-full" />;

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Screen</TableHead>
						<TableHead>Label</TableHead>
						<TableHead>Order</TableHead>
						<TableHead>Menu group</TableHead>
						<TableHead>Roles</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{screens.map((screen) => (
						<ScreenRow
							key={`${screen.key}-${screen.label}-${screen.sortOrder}-${screen.menuGroup}`}
							screen={screen}
							onEditRoles={() => setScreenForRoles(screen)}
						/>
					))}
				</TableBody>
			</Table>
			<ScreenRolesDialog
				// re-read from the fresh list so ticks reflect the latest roleIds
				screen={
					screens.find((s) => s.key === screenForRoles?.key) ?? screenForRoles
				}
				onClose={() => setScreenForRoles(null)}
			/>
		</>
	);
}
