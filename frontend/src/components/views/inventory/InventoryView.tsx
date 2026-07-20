"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

const INVENTORY_PAGES = [
  { href: "/inventory/items", label: "Items" },
  { href: "/inventory/services", label: "Services" },
  { href: "/inventory/machines", label: "Machines" },
  { href: "/inventory/locations", label: "Locations" },
  { href: "/inventory/movements", label: "Movements" },
];

export function InventoryView() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="text-sm text-muted-foreground">
        Select a module to manage inventory records.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INVENTORY_PAGES.map((page) => (
          <Button
            key={page.href}
            asChild
            variant="outline"
            className="justify-start"
          >
            <Link href={page.href}>{page.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
