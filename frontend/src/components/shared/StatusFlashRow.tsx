"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { shouldFlashStatus } from "@/lib/status-flash";
import { cn } from "@/lib/utils";

export type StatusFlashRowProps = {
	/** Change this value (e.g. the new status) to trigger one flash. Initial mount never flashes. */
	flashKey: string | null | undefined;
	children: ReactNode;
	className?: string;
	/** Wrapper element: `tr` for table rows (default), `div` elsewhere. */
	as?: "tr" | "div";
};

/** One brand-tint flash (BR-DS-12) when `flashKey` changes after mount. The wrapper has no role. */
export function StatusFlashRow({
	flashKey,
	children,
	className,
	as = "tr",
}: StatusFlashRowProps) {
	const prev = useRef(flashKey);
	const [flashing, setFlashing] = useState(false);

	useEffect(() => {
		const before = prev.current;
		prev.current = flashKey;
		if (!shouldFlashStatus(before, flashKey)) return;
		setFlashing(true);
		const timer = setTimeout(() => setFlashing(false), 600);
		return () => clearTimeout(timer);
	}, [flashKey]);

	const cls = cn(flashing && "animate-status-flash", className);
	return as === "div" ? (
		<div className={cls}>{children}</div>
	) : (
		<tr className={cls}>{children}</tr>
	);
}
