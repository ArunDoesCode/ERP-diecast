"use client";

import { useQueryState } from "nuqs";
import { useState } from "react";

import { EmployeesTab } from "@/components/pages/setup/EmployeesTab";
import { PagesTab } from "@/components/pages/setup/PagesTab";
import { PermissionsTab } from "@/components/pages/setup/PermissionsTab";
import { RolesTab } from "@/components/pages/setup/RolesTab";
import {
  SetupDialog,
  type SetupModalState,
} from "@/components/pages/setup/SetupDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Employee, Page, Role } from "@/types/setup";

type SetupEntity = "employee" | "role" | "page";

const SetupView = () => {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "employees" });
  const [modal, setModal] = useState<SetupModalState>({ open: false });

  function openCreate(entity: SetupEntity) {
    setModal({ open: true, entity, mode: "create" });
  }

  function openEditEmployee(employee: Employee) {
    setModal({ open: true, entity: "employee", mode: "edit", data: employee });
  }

  function openEditRole(role: Role) {
    setModal({ open: true, entity: "role", mode: "edit", data: role });
  }

  function openEditPage(page: Page) {
    setModal({ open: true, entity: "page", mode: "edit", data: page });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <EmployeesTab
            onCreateEmployee={() => openCreate("employee")}
            onEditEmployee={openEditEmployee}
          />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab
            onCreateRole={() => openCreate("role")}
            onEditRole={openEditRole}
          />
        </TabsContent>
        <TabsContent value="pages">
          <PagesTab
            onCreatePage={() => openCreate("page")}
            onEditPage={openEditPage}
          />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
      </Tabs>
      <SetupDialog modal={modal} onClose={() => setModal({ open: false })} />
    </div>
  );
};

export default SetupView;
