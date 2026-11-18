import type { StatusDoc } from "@/lib/status-tone";

export type StatusBadgeProps = {
	doc: StatusDoc;
	status: string | null;
	className?: string;
};

/** Stub: renders null until slice B. */
export function StatusBadge(_props: StatusBadgeProps) {
	return null;
}
