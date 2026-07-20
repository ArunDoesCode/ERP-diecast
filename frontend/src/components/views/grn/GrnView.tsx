import { ModulePageShell } from "@/components/common/ModulePageShell";
import { buildShellPage } from "@/lib/path-utils";

export function GrnView() {
  const page = buildShellPage("/grn");
  return <ModulePageShell page={page} />;
}
