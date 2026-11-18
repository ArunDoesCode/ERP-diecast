import type { ComponentType, ReactNode } from "react";

export type EmptyStateProps = {
	icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
	title: string;
	description?: string;
	action?: ReactNode;
};

// Contract stub (BR-DS-07): no logic yet.
export function EmptyState(_props: EmptyStateProps) {
	return null;
}
