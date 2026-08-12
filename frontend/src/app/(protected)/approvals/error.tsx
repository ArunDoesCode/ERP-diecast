"use client";

import { Button } from "@/components/ui/button";

type ApprovalsErrorProps = {
	reset: () => void;
};

export default function ApprovalsError({ reset }: ApprovalsErrorProps) {
	return (
		<div className="flex w-full flex-col gap-4 p-6">
			<p className="text-sm text-destructive">Failed to load approvals.</p>
			<Button
				type="button"
				variant="outline"
				className="w-fit"
				onClick={() => reset()}
			>
				Retry
			</Button>
		</div>
	);
}
