import type { ReactNode } from "react";

export type DetailMeta = { label: string; value: ReactNode };

export type DetailHeaderProps = {
	docNo: string;
	title?: string;
	status: ReactNode;
	meta?: DetailMeta[];
	actions?: ReactNode;
	backHref: string;
	backLabel: string;
	loading?: boolean;
};

// Contract stub (BR-DS-08): no logic yet.
export function DetailHeader(_props: DetailHeaderProps) {
	return null;
}
