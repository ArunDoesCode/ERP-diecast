"use client";

import { RoleTable } from "@/components/pages/setup/RoleTable";
import { Button } from "@/components/ui/button";
import { useSetupDrawerStore } from "@/lib/store/setupDrawerStore";

export function RolesTab() {
  const openCreate = useSetupDrawerStore((state) => state.openCreate);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openCreate("role")}>+ New Role</Button>
      </div>

      <RoleTable />
    </div>
  );
}
