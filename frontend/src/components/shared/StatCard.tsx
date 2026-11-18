import type { Icon } from "@tabler/icons-react";

export type StatCardProps = {
	label: string;
	value: number | string;
	/** Never "closed" and never the accent colour. */
	tone?: "neutral" | "warning" | "info" | "success" | "danger";
	icon?: Icon;
	hint?: string;
	href?: string;
	loading?: boolean;
	error?: boolean;
	onRetry?: () => void;
	countUp?: boolean;
};

/** Stub: renders null until slice B. */
export function StatCard(_props: StatCardProps) {
	return null;
}
