import type { ReactNode } from "react";

export type StatusFlashRowProps = {
	/** Change this value (e.g. the new status) to trigger one flash. Initial mount never flashes. */
	flashKey: string | null | undefined;
	children: ReactNode;
	className?: string;
};

// Contract stub (BR-DS-12): no logic yet.
export function StatusFlashRow(_props: StatusFlashRowProps) {
	return null;
}
