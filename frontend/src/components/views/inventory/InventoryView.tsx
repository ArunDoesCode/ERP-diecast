"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";

import { Button } from "@/components/ui/button";

const INVENTORY_PAGES = [
	{ href: "/inventory/items", label: "Items" },
	{ href: "/inventory/services", label: "Services" },
	{ href: "/inventory/machines", label: "Machines" },
	{ href: "/inventory/locations", label: "Locations" },
	{ href: "/inventory/stock", label: "Stock" },
	{ href: "/inventory/movements", label: "Movements" },
	{ href: "/inventory/stock-transfers", label: "Stock transfers" },
	{ href: "/inventory/stock-check", label: "Stock check" },
];

export function InventoryView() {
	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Inventory"
				description="Select a module to manage inventory records."
			/>

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
