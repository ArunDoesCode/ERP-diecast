"use client";

import * as React from "react";

import { ModulePagesPopover } from "@/components/pages/setup/ModulePagesPopover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useModulesQuery,
  usePagesQuery,
  usePermissionGrantsQuery,
  useRolesQuery,
  useUpdateRolePermissionsMutation,
} from "@/lib/api/setup/queries";
import type { Module, Page, RolePage, RolePermissionDiff } from "@/types/setup";

type RolePermissionEditorProps = {
  roleId?: number | null;
  onRoleIdChange?: (roleId: number | null) => void;
  onCancel?: () => void;
};

export function RolePermissionEditor({
  roleId: controlledRoleId,
  onRoleIdChange,
  onCancel,
}: RolePermissionEditorProps) {
  const rolesQuery = useRolesQuery();
  const modulesQuery = useModulesQuery();
  const pagesQuery = usePagesQuery();
  const grantsQuery = usePermissionGrantsQuery();
  const updateMutation = useUpdateRolePermissionsMutation();

  const [internalRoleId, setInternalRoleId] = React.useState<number | null>(
    null,
  );
  const isControlled = controlledRoleId !== undefined;
  const selectedRoleId = isControlled
    ? (controlledRoleId ?? null)
    : internalRoleId;

  function handleRoleChange(value: string) {
    const id = Number(value);
    onRoleIdChange?.(id);
    if (!isControlled) setInternalRoleId(id);
  }

  const roles = rolesQuery.data?.data ?? [];
  const modules = modulesQuery.data?.data ?? [];
  const pages = pagesQuery.data?.data ?? [];
  const grants = grantsQuery.data?.data ?? [];

  const isLoading =
    rolesQuery.isLoading ||
    modulesQuery.isLoading ||
    pagesQuery.isLoading ||
    grantsQuery.isLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={selectedRoleId ? String(selectedRoleId) : ""}
          onValueChange={handleRoleChange}
        >
          <SelectTrigger className="w-1/4">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent position="popper">
            {roles.map((role) => (
              <SelectItem key={role.id} value={String(role.id)}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onCancel ? (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !selectedRoleId ? (
        <p className="text-xs/relaxed text-muted-foreground">
          Select a role to edit its permissions.
        </p>
      ) : modules.length === 0 ? (
        <p className="text-xs/relaxed text-muted-foreground">
          No modules configured.
        </p>
      ) : (
        <RolePermissionWorkingArea
          key={selectedRoleId}
          roleId={selectedRoleId}
          modules={modules}
          pages={pages}
          grants={grants}
          mutation={updateMutation}
        />
      )}
    </div>
  );
}

type RolePermissionWorkingAreaProps = {
  roleId: number;
  modules: Module[];
  pages: Page[];
  grants: RolePage[];
  mutation: ReturnType<typeof useUpdateRolePermissionsMutation>;
};

function RolePermissionWorkingArea({
  roleId,
  modules,
  pages,
  grants,
  mutation,
}: RolePermissionWorkingAreaProps) {
  const originalPageIds = React.useMemo(
    () =>
      new Set(
        grants.filter((grant) => grant.roleId === roleId).map((g) => g.pageId),
      ),
    [grants, roleId],
  );

  const [grantedPageIds, setGrantedPageIds] = React.useState<Set<number>>(
    () => new Set(originalPageIds),
  );

  function handleToggle(pageId: number, checked: boolean) {
    setGrantedPageIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(pageId);
      } else {
        next.delete(pageId);
      }
      return next;
    });
  }

  const diff = React.useMemo(() => {
    const result: RolePermissionDiff = {};

    for (const moduleObj of modules) {
      const modulePages = pages.filter((p) => p.moduleId === moduleObj.id);
      const added: number[] = [];
      const deleted: number[] = [];

      for (const page of modulePages) {
        const wasGranted = originalPageIds.has(page.id);
        const isGranted = grantedPageIds.has(page.id);

        if (!wasGranted && isGranted) added.push(page.id);
        if (wasGranted && !isGranted) deleted.push(page.id);
      }

      if (added.length > 0 || deleted.length > 0) {
        result[String(moduleObj.id)] = { added, deleted };
      }
    }

    return result;
  }, [modules, pages, originalPageIds, grantedPageIds]);

  const hasDiff = Object.keys(diff).length > 0;

  function handleSubmit() {
    mutation.mutate({ roleId, diff });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {modules.map((moduleObj) => {
          const modulePages = pages.filter((p) => p.moduleId === moduleObj.id);
          const grantedCount = modulePages.filter((p) =>
            grantedPageIds.has(p.id),
          ).length;

          return (
            <ModulePagesPopover
              key={moduleObj.id}
              module={moduleObj}
              pages={pages}
              grantedPageIds={grantedPageIds}
              onToggle={handleToggle}
            >
              <button
                type="button"
                className="flex w-full flex-row items-center justify-between px-3 py-2 hover:bg-muted/50"
              >
                <span>{moduleObj.name}</span>
                <Badge variant="outline">
                  {grantedCount}/{modulePages.length}
                </Badge>
              </button>
            </ModulePagesPopover>
          );
        })}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={mutation.isPending || !hasDiff}
        className="w-fit"
      >
        {mutation.isPending ? "Saving..." : "Submit"}
      </Button>
    </div>
  );
}
