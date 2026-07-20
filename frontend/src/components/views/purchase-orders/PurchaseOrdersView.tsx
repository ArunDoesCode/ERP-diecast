import { ModulePageShell } from "@/components/common/ModulePageShell";
import { buildShellPage } from "@/lib/path-utils";

export function PurchaseOrdersView() {
  const page = buildShellPage("/purchase-orders");
  return <ModulePageShell page={page} />;
}
