"use client";

import { useState } from "react";

import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { EmployeeForm } from "@/components/pages/setup/EmployeeForm";
import { PageForm } from "@/components/pages/setup/PageForm";
import { RoleForm } from "@/components/pages/setup/RoleForm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSetupDrawerStore } from "@/lib/store/setupDrawerStore";
import type {
  Employee,
  EmployeeInput,
  Page,
  PageInput,
  Role,
  RoleInput,
} from "@/types/setup";

function toEmployeeInput(employee: Employee): EmployeeInput {
  return {
    name: employee.name,
    phone: employee.phone ?? "",
    dailyRatePaise: employee.dailyRatePaise,
    roleId: employee.roleId,
    loginMethod: employee.loginMethod,
    email: employee.email ?? "",
    password: "",
  };
}

function toRoleInput(role: Role): RoleInput {
  return { name: role.name };
}

function toPageInput(page: Page): PageInput {
  return {
    key: page.key,
    label: page.label,
    path: page.path,
    sortOrder: page.sortOrder,
    moduleId: page.moduleId,
  };
}

const ENTITY_LABEL: Record<"employee" | "role" | "page", string> = {
  employee: "Employee",
  role: "Role",
  page: "Page",
};

export function SetupSheet() {
  const drawer = useSetupDrawerStore((state) => state.drawer);
  const close = useSetupDrawerStore((state) => state.close);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  return (
    <>
      <Sheet
        open={drawer.open}
        onOpenChange={(open) => {
          if (open) return;
          if (isDirty) {
            setConfirmDiscardOpen(true);
            return;
          }
          close();
        }}
      >
        <SheetContent>
          {drawer.open && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {drawer.mode === "create" ? "New" : "Edit"}{" "}
                  {ENTITY_LABEL[drawer.entity]}
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 pb-6">
                {drawer.entity === "employee" && (
                  <EmployeeForm
                    key={`employee-${drawer.mode}-${
                      drawer.mode === "edit" ? drawer.data.id : "new"
                    }`}
                    mode={drawer.mode}
                    defaultValues={
                      drawer.mode === "edit"
                        ? toEmployeeInput(drawer.data)
                        : undefined
                    }
                    employeeId={
                      drawer.mode === "edit" ? drawer.data.id : undefined
                    }
                    qrToken={
                      drawer.mode === "edit" ? drawer.data.qrToken : undefined
                    }
                    onDirtyChange={setIsDirty}
                    onDone={close}
                  />
                )}

                {drawer.entity === "role" && (
                  <RoleForm
                    key={`role-${drawer.mode}-${
                      drawer.mode === "edit" ? drawer.data.id : "new"
                    }`}
                    mode={drawer.mode}
                    defaultValues={
                      drawer.mode === "edit"
                        ? toRoleInput(drawer.data)
                        : undefined
                    }
                    roleId={drawer.mode === "edit" ? drawer.data.id : undefined}
                    isSystem={
                      drawer.mode === "edit" ? drawer.data.isSystem : false
                    }
                    onDirtyChange={setIsDirty}
                    onDone={close}
                  />
                )}

                {drawer.entity === "page" && (
                  <PageForm
                    key={`page-${drawer.mode}-${
                      drawer.mode === "edit" ? drawer.data.id : "new"
                    }`}
                    mode={drawer.mode}
                    defaultValues={
                      drawer.mode === "edit"
                        ? toPageInput(drawer.data)
                        : undefined
                    }
                    pageId={drawer.mode === "edit" ? drawer.data.id : undefined}
                    onDirtyChange={setIsDirty}
                    onDone={close}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDeleteDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          setIsDirty(false);
          close();
        }}
        title="Discard unsaved changes?"
        description="You have unsaved changes in this form. Closing now will discard them."
      />
    </>
  );
}
