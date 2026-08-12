"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function InventoryBackButton() {
	const router = useRouter();

	return (
		<Button
			type="button"
			variant="secondary"
			className="w-fit"
			onClick={() => router.push("/inventory")}
		>
			<IconArrowLeft className="size-4" />
			Back to Inventory
		</Button>
	);
}
