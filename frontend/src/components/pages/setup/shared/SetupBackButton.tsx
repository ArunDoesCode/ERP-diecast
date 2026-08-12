"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function SetupBackButton() {
	const router = useRouter();

	return (
		<Button
			type="button"
			variant="secondary"
			className="w-fit"
			onClick={() => router.push("/setup")}
		>
			<IconArrowLeft className="size-4" />
			Back to Inventory
		</Button>
	);
}
