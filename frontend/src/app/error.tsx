"use client";

export default function GlobalError({
	error: _error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	void _error;

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<div className="w-full max-w-md space-y-4 rounded-lg border p-6">
				<h1 className="text-lg font-semibold">Something went wrong</h1>
				<p className="text-sm text-muted-foreground">
					Please try again. If the issue persists, contact support.
				</p>
				<button
					type="button"
					onClick={reset}
					className="rounded-md border px-3 py-2 text-sm"
				>
					Retry
				</button>
			</div>
		</div>
	);
}
