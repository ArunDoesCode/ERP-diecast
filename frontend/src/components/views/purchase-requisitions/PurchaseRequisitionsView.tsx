import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function PurchaseRequisitionsView() {
  const page = getPageDefinition("/purchase-requisitions");

  if (!page) {
    throw new Error("Missing page definition for /purchase-requisitions ");
  }

  return <ModulePageShell page={page} />;
}
