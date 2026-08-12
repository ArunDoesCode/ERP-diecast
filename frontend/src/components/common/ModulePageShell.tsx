import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ModulePageShellProps = {
	page: {
		path: string;
		title: string;
		module?: string;
		description?: string;
		roles?: string[];
	};
};

export function ModulePageShell({ page }: ModulePageShellProps) {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
			<Card>
				<CardHeader className="space-y-3">
					{page.module ? (
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							{page.module}
						</p>
					) : null}
					<CardTitle className="text-2xl">{page.title}</CardTitle>
					{page.description ? (
						<p className="text-sm text-muted-foreground">{page.description}</p>
					) : null}
					{page.roles?.length ? (
						<div className="flex flex-wrap gap-2">
							{page.roles.map((role) => (
								<span
									key={role}
									className="rounded-md border border-border px-2 py-1 text-xs text-foreground"
								>
									{role}
								</span>
							))}
						</div>
					) : null}
				</CardHeader>
				<CardContent className="space-y-3 text-sm text-muted-foreground">
					<p>
						Shell ready. Backend integration pending. Hook this page to queries,
						table views, and mutations when APIs are available.
					</p>
					<p>
						Route:{" "}
						<span className="font-mono text-foreground">{page.path}</span>
					</p>
				</CardContent>
			</Card>
		</main>
	);
}
