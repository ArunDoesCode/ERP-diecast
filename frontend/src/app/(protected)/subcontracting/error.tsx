"use client";

import { Button } from "@/components/ui/button";

export default function SubcontractingError({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	return (
		<div className="flex flex-col items-start gap-3 p-6">
			<p className="text-sm text-muted-foreground">
				{error.message || "Something went wrong."}
			</p>
			<Button type="button" size="sm" onClick={reset}>
				Try again
			</Button>
		</div>
	);
}
