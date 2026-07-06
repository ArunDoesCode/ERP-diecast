"use client";

import * as React from "react";

import { EmployeeCombobox } from "@/components/pages/setup/EmployeeCombobox";
import { EmployeePermissionPreview } from "@/components/pages/setup/EmployeePermissionPreview";
import { RolePermissionEditor } from "@/components/pages/setup/RolePermissionEditor";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Employee } from "@/types/setup";

type PermissionsMode = "role" | "employee";

export function PermissionsTab() {
  const [mode, setMode] = React.useState<PermissionsMode>("role");
  const [selectedRoleId, setSelectedRoleId] = React.useState<number | null>(
    null,
  );
  const [employeeSearch, setEmployeeSearch] = React.useState("");
  const [selectedEmployee, setSelectedEmployee] =
    React.useState<Employee | null>(null);

  function handleEditRole(roleId: number) {
    setSelectedRoleId(roleId);
    setMode("role");
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={mode}
        onValueChange={(value) => {
          if (value) setMode(value as PermissionsMode);
        }}
        className="flex justify-end w-full"
      >
        <ToggleGroupItem value="role">Edit by Role</ToggleGroupItem>
        <ToggleGroupItem value="employee">View by Employee</ToggleGroupItem>
      </ToggleGroup>

      {mode === "role" ? (
        <RolePermissionEditor
          roleId={selectedRoleId}
          onRoleIdChange={setSelectedRoleId}
          onCancel={() => setMode("employee")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <EmployeeCombobox
            search={employeeSearch}
            onSearchChange={setEmployeeSearch}
            onSelect={setSelectedEmployee}
          />
          {selectedEmployee ? (
            <EmployeePermissionPreview
              employee={selectedEmployee}
              onEditRole={handleEditRole}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
