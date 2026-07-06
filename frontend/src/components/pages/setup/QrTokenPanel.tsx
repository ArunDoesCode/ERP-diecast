"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGenerateEmployeeQrMutation } from "@/lib/api/setup/queries";

type QrTokenPanelProps = {
  mode: "create" | "edit";
  employeeId?: number;
  qrToken?: string | null;
};

export function QrTokenPanel({ mode, employeeId, qrToken }: QrTokenPanelProps) {
  const generateQrMutation = useGenerateEmployeeQrMutation();

  if (mode === "create" || !employeeId) {
    return (
      <p className="text-xs/relaxed text-muted-foreground">
        Save the employee first, then generate a QR token from the Edit sheet.
      </p>
    );
  }

  // ponytail: QR image rendering deferred, raw token shown as text only
  const token = generateQrMutation.data?.data.qrToken ?? qrToken;

  function handleCopy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    toast.success("Copied");
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={generateQrMutation.isPending}
        onClick={() => generateQrMutation.mutate(employeeId)}
      >
        {generateQrMutation.isPending
          ? "Generating..."
          : token
            ? "Regenerate QR Token"
            : "Generate QR Token"}
      </Button>

      {generateQrMutation.isPending && <Skeleton className="h-8 w-full" />}

      {token && !generateQrMutation.isPending && (
        <div className="flex flex-col gap-2">
          <code className="block break-all rounded-md border border-border bg-muted px-2 py-1.5 text-xs/relaxed">
            {token}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopy}
          >
            Copy Raw Token
          </Button>
        </div>
      )}
    </div>
  );
}
