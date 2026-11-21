import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TwoPaneLayoutProps = {
	/** Main column: header, lines, form fields. */
	children: ReactNode;
	/** Side panel (BR-FF-50). Moves under the main column below 1100 px. */
	side: ReactNode;
	/** Accessible name of the side panel. */
	sideLabel?: string;
	className?: string;
};

/**
 * Two-pane detail / form layout at full content width (BR-FF-103, 113): main column left,
 * side panel right; one column below 1100 px with the panel under the main column.
 */
export function TwoPaneLayout({
	children,
	side,
	sideLabel = "Details",
	className,
}: TwoPaneLayoutProps) {
	return (
		<div
			className={cn(
				"grid grid-cols-1 gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]",
				className,
			)}
		>
			<div className="min-w-0 space-y-6">{children}</div>
			<aside aria-label={sideLabel} className="min-w-0 space-y-4">
				{side}
			</aside>
		</div>
	);
}
