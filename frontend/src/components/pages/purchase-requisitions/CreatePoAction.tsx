"use client";

import { IconFileInvoice } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { PrPageItem } from "@/lib/api/purchase-requisitions/detail-types";

/**
 * Hook point for "Create PO" (BR-FF-48, 49, 92). The dialog and the one-draft-per-supplier call
 * are built in sub-feature 4; this button only marks where it plugs in. `pendingLines` are the
 * lines it will cover.
 */
export function CreatePoAction({
	pendingLines,
}: {
	prId: number;
	pendingLines: PrPageItem[];
}) {
	return (
		<Button
			type="button"
			onClick={() => {
				if (pendingLines.length === 0) return;
				toast.info("Create PO is not wired yet.");
			}}
		>
			<IconFileInvoice className="size-3.5" />
			Create PO
		</Button>
	);
}
