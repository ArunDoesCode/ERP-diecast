"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModulePagesPopover } from "@/components/pages/setup/ModulePagesPopover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useModulesQuery,
  usePagesQuery,
  usePermissionGrantsQuery,
  useRolesQuery,
} from "@/lib/api/setup/queries";
import type { Employee } from "@/types/setup";

type EmployeePermissionPreviewProps = {
  employee: Employee;
  onEditRole: (roleId: number) => void;
};

export function EmployeePermissionPreview({
  employee,
  onEditRole,
}: EmployeePermissionPreviewProps) {
  const rolesQuery = useRolesQuery();
  const modulesQuery = useModulesQuery();
  const pagesQuery = usePagesQuery();
  const grantsQuery = usePermissionGrantsQuery();

  const isLoading =
    rolesQuery.isLoading ||
    modulesQuery.isLoading ||
    pagesQuery.isLoading ||
    grantsQuery.isLoading;

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const roles = rolesQuery.data?.data ?? [];
  const modules = modulesQuery.data?.data ?? [];
  const pages = pagesQuery.data?.data ?? [];
  const grants = grantsQuery.data?.data ?? [];

  const role = roles.find((r) => r.id === employee.roleId);
  const grantedPageIds = new Set(
    grants
      .filter((grant) => grant.roleId === employee.roleId)
      .map((grant) => grant.pageId),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs/relaxed text-muted-foreground">
          Role:{" "}
          <span className="font-medium text-foreground">
            {role?.name ?? "Unknown role"}
          </span>
        </p>
        <Button
          variant="link"
          size="sm"
          onClick={() => onEditRole(employee.roleId)}
        >
          Edit this role's permissions →
        </Button>
      </div>

      {modules.length === 0 ? (
        <p className="text-xs/relaxed text-muted-foreground">
          No modules configured.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {modules.map((moduleObj) => {
            const modulePages = pages.filter(
              (p) => p.moduleId === moduleObj.id,
            );
            const grantedCount = modulePages.filter((p) =>
              grantedPageIds.has(p.id),
            ).length;

            return (
              <ModulePagesPopover
                key={moduleObj.id}
                module={moduleObj}
                pages={pages}
                grantedPageIds={grantedPageIds}
                onToggle={() => {}}
                readOnly
              >
                <Card
                  role="button"
                  tabIndex={0}
                  className="flex-row items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50"
                >
                  <span>{moduleObj.name}</span>
                  <Badge variant="outline">
                    {grantedCount}/{modulePages.length}
                  </Badge>
                </Card>
              </ModulePagesPopover>
            );
          })}
        </div>
      )}
    </div>
  );
}
