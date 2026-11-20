import type { ComponentType, ReactNode } from "react";

export type EmptyStateProps = {
	icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
	title: string;
	description?: string;
	action?: ReactNode;
};

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: EmptyStateProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: spec requires role=status on a div
		<div
			role="status"
			className="flex flex-col items-center gap-2 px-4 py-10 text-center"
		>
			{Icon ? (
				<span className="text-muted-foreground">
					<Icon size={24} aria-hidden="true" />
				</span>
			) : null}
			<p className="text-sm font-medium">{title}</p>
			{description ? (
				<p className="max-w-sm text-sm text-muted-foreground">{description}</p>
			) : null}
			{action ? <div className="mt-2">{action}</div> : null}
		</div>
	);
}
