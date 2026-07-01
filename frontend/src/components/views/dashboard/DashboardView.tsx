"use client";

import { DashboardActions } from "@/components/pages/dashboard/DashboardActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLogoutMutation, useMeQuery } from "@/lib/api/auth/queries";
import { usePresignMutation } from "@/lib/api/files/queries";
import { getAccessToken } from "@/lib/auth/token";

export function DashboardView() {
  const token = getAccessToken();
  const meQuery = useMeQuery(Boolean(token));
  const logoutMutation = useLogoutMutation();
  const presignMutation = usePresignMutation();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Protected Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Backend-driven user data:
          </p>
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(meQuery.data?.data ?? null, null, 2)}
          </pre>

          <DashboardActions
            presignMutation={presignMutation}
            logoutMutation={logoutMutation}
          />

          {presignMutation.data ? (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(presignMutation.data.data, null, 2)}
            </pre>
          ) : null}

          {meQuery.isError ? (
            <p className="text-sm text-red-600">{meQuery.error.message}</p>
          ) : null}
          {presignMutation.isError ? (
            <p className="text-sm text-red-600">
              {presignMutation.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
