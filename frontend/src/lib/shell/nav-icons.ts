import type { Icon } from "@tabler/icons-react";

/** Route path (e.g. "/purchase-orders") -> Tabler icon. Unknown routes get a fallback icon. */
export function getNavIcon(_path: string): Icon {
	throw new Error("not implemented");
}
