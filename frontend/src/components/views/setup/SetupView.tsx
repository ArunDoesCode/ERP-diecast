"use client";

import { useQueryState } from "nuqs";

import { EmployeesTab } from "@/components/pages/setup/EmployeesTab";
import { PagesTab } from "@/components/pages/setup/PagesTab";
import { PermissionsTab } from "@/components/pages/setup/PermissionsTab";
import { RolesTab } from "@/components/pages/setup/RolesTab";
import { SetupSheet } from "@/components/pages/setup/SetupSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SetupView = () => {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "employees" });

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
          <EmployeesTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="pages">
          <PagesTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
      </Tabs>
      <SetupSheet />
    </div>
  );
};

export default SetupView;
