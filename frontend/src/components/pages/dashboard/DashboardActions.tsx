"use client";

import { Button } from "@/components/ui/button";
import type { useLogoutMutation } from "@/lib/api/auth/queries";
import type { usePresignMutation } from "@/lib/api/files/queries";

type DashboardActionsProps = {
  presignMutation: ReturnType<typeof usePresignMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
};

export function DashboardActions({
  presignMutation,
  logoutMutation,
}: DashboardActionsProps) {
  return (
    <div className="flex gap-3">
      <Button
        type="button"
        onClick={() => presignMutation.mutate()}
        disabled={presignMutation.isPending}
      >
        {presignMutation.isPending ? "Loading..." : "Request file upload token"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        Logout
      </Button>
    </div>
  );
}
