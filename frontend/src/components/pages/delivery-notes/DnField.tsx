import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** One field look: label above, control, then the error (or hint) line. Keeps `min-h-19` (BR-DS-29). */
export function DnField({
	id,
	label,
	hint,
	error,
	children,
	className,
}: {
	id: string;
	label: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("min-h-19 space-y-1", className)}>
			<Label htmlFor={id}>{label}</Label>
			{children}
			{error ? (
				<p className="text-[13px] text-destructive">{error}</p>
			) : hint ? (
				<p className="text-[13px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

export function DnBanner({
	tone,
	children,
}: {
	tone: "warning" | "danger";
	children: ReactNode;
}) {
	return (
		<div
			role={tone === "danger" ? "alert" : "status"}
			className={cn(
				"flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm",
				tone === "danger"
					? "bg-destructive-subtle text-destructive"
					: "bg-warning-subtle text-warning",
			)}
		>
			{children}
		</div>
	);
}
