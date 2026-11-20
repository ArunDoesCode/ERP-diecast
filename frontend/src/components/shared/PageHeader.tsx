import type { ReactNode } from "react";

export type PageHeaderProps = {
	title: string;
	description?: string;
	actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
	return (
		<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0">
				<h1 className="font-heading text-2xl leading-8 font-bold">{title}</h1>
				<div aria-hidden="true" className="mt-1 h-0.5 w-10 bg-brand-accent" />
				{description ? (
					<p className="mt-2 text-xs text-muted-foreground">{description}</p>
				) : null}
			</div>
			{actions ? (
				// biome-ignore lint/a11y/useSemanticElements: spec BR-DS-17 requires role=group named "Page actions"
				<div
					role="group"
					aria-label="Page actions"
					className="flex flex-wrap items-center gap-2"
				>
					{actions}
				</div>
			) : null}
		</header>
	);
}
