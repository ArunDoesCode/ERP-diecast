"use client";

export default function SetupError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-3 p-6">
      <p className="text-sm text-red-600">{error.message}</p>
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
