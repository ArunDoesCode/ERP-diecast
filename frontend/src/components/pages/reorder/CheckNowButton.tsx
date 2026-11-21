"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useCheckReorderNowMutation } from "@/lib/api/reorder/queries";

/** The one primary action of the reorder screens (BR-RO-11). A finished run, even a failed one, opens its detail. */
export function CheckNowButton() {
	const router = useRouter();
	const check = useCheckReorderNowMutation();
	return (
		<Button
			type="button"
			size="sm"
			disabled={check.isPending}
			onClick={() =>
				check.mutate(undefined, {
					onSuccess: (result) =>
						router.push(`/inventory/reorder/runs/${result.data.id}`),
				})
			}
		>
			{check.isPending ? "Checking…" : "Check now"}
		</Button>
	);
}
