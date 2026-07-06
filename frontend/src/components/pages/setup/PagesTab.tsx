"use client";

import { PageTable } from "@/components/pages/setup/PageTable";
import { Button } from "@/components/ui/button";
import { useSetupDrawerStore } from "@/lib/store/setupDrawerStore";

export function PagesTab() {
  const openCreate = useSetupDrawerStore((state) => state.openCreate);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openCreate("page")}>+ New Page</Button>
      </div>

      <PageTable />
    </div>
  );
}
