"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

const INVENTORY_PAGES = [
	{ href: "/inventory/items", label: "Items" },
	{ href: "/inventory/services", label: "Services" },
	{ href: "/inventory/machines", label: "Machines" },
	{ href: "/inventory/locations", label: "Locations" },
	{ href: "/inventory/stock", label: "Stock" },
	{ href: "/inventory/movements", label: "Movements" },
];

export function InventoryView() {
	return (
		<div className="flex w-full flex-col gap-4 p-6">
			<h1 className="text-2xl font-semibold">Inventory</h1>
			<p className="text-sm text-muted-foreground">
				Select a module to manage inventory records.
			</p>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{INVENTORY_PAGES.map((page) => (
					<Button
						key={page.href}
						asChild
						variant="secondary"
						className="justify-start"
					>
						<Link href={page.href}>{page.label}</Link>
					</Button>
				))}
			</div>
		</div>
	);
}
