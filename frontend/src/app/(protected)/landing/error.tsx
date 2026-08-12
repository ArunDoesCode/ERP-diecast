"use client";

export default function DashboardError({
	error: _error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	void _error;

	return (
		<div className="space-y-3 p-6">
			<p className="text-sm text-red-600">
				Something went wrong while loading this page.
			</p>
			<button
				className="rounded-md border px-3 py-2 text-sm"
				onClick={reset}
				type="button"
			>
				Retry
			</button>
		</div>
	);
}
