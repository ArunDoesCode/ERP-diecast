import type { ReactNode } from "react";

export type QuickFilter = { key: string; label: string; count?: number };

export type FilterBarProps = {
	quick?: QuickFilter[];
	value: string;
	onChange: (key: string) => void;
	children?: ReactNode;
	onReset?: () => void;
};

// Contract stub (BR-DS-14): no logic yet.
export function FilterBar(_props: FilterBarProps) {
	return null;
}
