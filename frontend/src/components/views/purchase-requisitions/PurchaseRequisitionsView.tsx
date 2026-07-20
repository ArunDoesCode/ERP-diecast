import { ModulePageShell } from "@/components/common/ModulePageShell";
import { buildShellPage } from "@/lib/path-utils";

export function PurchaseRequisitionsView() {
  const page = buildShellPage("/purchase-requisitions");

  return <ModulePageShell page={page} />;
}
