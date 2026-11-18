import type { ReactNode } from "react";

export type PageHeaderProps = {
	title: string;
	description?: string;
	actions?: ReactNode;
};

// Contract stub (BR-DS-07): no logic yet.
export function PageHeader(_props: PageHeaderProps) {
	return null;
}
