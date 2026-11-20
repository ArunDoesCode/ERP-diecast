import { getStatusTone, type StatusDoc, type Tone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

export type StatusBadgeProps = {
	doc: StatusDoc;
	status: string | null;
	className?: string;
};

const TONE_CLASS: Record<Tone, string> = {
	neutral: "bg-neutral-subtle text-neutral",
	warning: "bg-warning-subtle text-warning",
	info: "bg-info-subtle text-info",
	success: "bg-success-subtle text-success",
	danger: "bg-destructive-subtle text-destructive",
	closed: "border border-border bg-transparent text-muted-foreground",
};

export function StatusBadge({ doc, status, className }: StatusBadgeProps) {
	const { label, tone, icon: ToneIcon } = getStatusTone(doc, status);
	return (
		<span
			className={cn(
				"inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs leading-5 font-semibold",
				TONE_CLASS[tone],
				className,
			)}
		>
			<ToneIcon size={12} stroke={2} aria-hidden="true" className="shrink-0" />
			{label}
		</span>
	);
}
