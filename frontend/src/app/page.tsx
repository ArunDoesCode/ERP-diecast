import Link from "next/link";

export default function HomePage() {
	return (
		<main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="text-4xl font-bold">DiecastOS Starter</h1>
			<p className="text-muted-foreground">
				Frontend and backend are split. Frontend calls backend over HTTP only.
			</p>
			<div className="flex gap-3">
				<Link
					className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
					href="/login"
				>
					Login
				</Link>
				<Link
					className="rounded-md border border-border px-4 py-2"
					href="/dashboard"
				>
					Dashboard
				</Link>
			</div>
		</main>
	);
}
