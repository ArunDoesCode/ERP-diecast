"use client";

import { type Icon, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
	/**
	 * Late / Today / Later chips (BR-FF-15). Each is a link next to the tile body, never inside it.
	 * Zero counts are not drawn. Left edge turns danger when late > 0.
	 */
	split?: StatCardSplit;
};

export type StatCardSplitChip = { count: number; href: string };
export type StatCardSplit = {
	late?: StatCardSplitChip;
	today?: StatCardSplitChip;
	later?: StatCardSplitChip;
};

const SPLIT_CHIPS: Array<{
	key: keyof StatCardSplit;
	label: string;
	tone: NonNullable<StatCardProps["tone"]>;
}> = [
	{ key: "late", label: "late", tone: "danger" },
	{ key: "today", label: "today", tone: "warning" },
	{ key: "later", label: "later", tone: "neutral" },
];

const EDGE: Record<NonNullable<StatCardProps["tone"]>, string> = {
	neutral: "border-l-neutral",
	warning: "border-l-warning",
	info: "border-l-info",
	success: "border-l-success",
	danger: "border-l-destructive",
};

const CHIP: Record<NonNullable<StatCardProps["tone"]>, string> = {
	neutral: "bg-neutral-subtle text-neutral",
	warning: "bg-warning-subtle text-warning",
	info: "bg-info-subtle text-info",
	success: "bg-success-subtle text-success",
	danger: "bg-destructive-subtle text-destructive",
};

const COUNT_UP_MS = 600;
// --ease-standard: cubic-bezier(0.2, 0, 0, 1)
function easeStandard(t: number): number {
	// Solve x(s) = t by bisection, return y(s).
	const [x1, y1, x2, y2] = [0.2, 0, 0, 1];
	const bez = (a: number, b: number, s: number) =>
		3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (bez(x1, x2, mid) < t) lo = mid;
		else hi = mid;
	}
	return bez(y1, y2, (lo + hi) / 2);
}

/**
 * Counts 0 -> value once per mount. First render (server and client) is the final value;
 * later value changes never re-animate; reduced motion keeps the final value.
 */
function useCountUp(value: number | string, enabled: boolean) {
	const [shown, setShown] = useState<number | null>(null);
	const latest = useRef(value);
	latest.current = value;

	// Depends on `enabled` only: value changes never restart the run, and the
	// frame reads the latest value, so the end state is always the current value.
	useEffect(() => {
		if (!enabled || typeof latest.current !== "number") return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let raf = 0;
		const t0 = performance.now();
		const step = (now: number) => {
			const target = latest.current;
			const t = Math.min((now - t0) / COUNT_UP_MS, 1);
			if (t >= 1 || typeof target !== "number") {
				setShown(null);
				return;
			}
			setShown(Math.round(target * easeStandard(t)));
			raf = requestAnimationFrame(step);
		};
		setShown(0);
		raf = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(raf);
			setShown(null);
		};
	}, [enabled]);

	return shown;
}

export function StatCard({
	label,
	value,
	tone = "neutral",
	icon: CardIcon,
	hint,
	href,
	loading,
	error,
	onRetry,
	countUp,
	split,
}: StatCardProps) {
	const animated = useCountUp(value, Boolean(countUp) && !loading && !error);
	const finalText = typeof value === "number" ? String(value) : value;
	const shownText = animated === null ? finalText : String(animated);

	const edgeTone = (split?.late?.count ?? 0) > 0 ? "danger" : tone;
	const chips =
		split && !loading && !error
			? SPLIT_CHIPS.filter((c) => (split[c.key]?.count ?? 0) > 0)
			: [];

	const className = cn(
		"flex items-start gap-3 rounded-lg border border-l-[3px] bg-card p-4 text-card-foreground",
		EDGE[edgeTone],
		chips.length > 0 && "flex-col",
		href &&
			"transition-colors duration-(--motion-fast) hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
	);

	const body = (
		<>
			{CardIcon && (
				<span
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-md",
						CHIP[tone],
					)}
				>
					<CardIcon size={16} stroke={1.75} aria-hidden="true" />
				</span>
			)}
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
					{label}
				</span>
				{loading ? (
					<Skeleton className="h-9 w-16" aria-hidden="true" />
				) : error ? (
					<>
						<span className="text-[28px] leading-9 font-bold tabular-nums">
							–
						</span>
						{onRetry && (
							<button
								type="button"
								onClick={onRetry}
								className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-accent underline-offset-4 hover:underline"
							>
								<IconRefresh size={12} stroke={2} aria-hidden="true" />
								Try again
							</button>
						)}
					</>
				) : (
					<>
						<span
							className="text-[28px] leading-9 font-bold tabular-nums"
							aria-hidden={countUp ? "true" : undefined}
						>
							{shownText}
						</span>
						{countUp && <span className="sr-only">{finalText}</span>}
					</>
				)}
				{hint && !loading && (
					<span className="text-sm text-muted-foreground">{hint}</span>
				)}
			</span>
		</>
	);

	const accessibleName =
		!loading && !error ? `${label}: ${finalText}` : undefined;

	if (href && !error && chips.length > 0) {
		// Body link and chip links are siblings: no nested links.
		return (
			<div className={cn(className, "gap-2")}>
				<Link
					href={href}
					aria-label={accessibleName}
					className="flex w-full items-start gap-3 rounded-md transition-colors duration-(--motion-fast) hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
				>
					{body}
				</Link>
				<div className="flex flex-wrap gap-2">
					{chips.map((c) => {
						const chip = split?.[c.key];
						if (!chip) return null;
						return (
							<Link
								key={c.key}
								href={chip.href}
								className={cn(
									"inline-flex h-6 items-center rounded-full px-2 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
									CHIP[c.tone],
								)}
							>
								{chip.count} {c.label}
							</Link>
						);
					})}
				</div>
			</div>
		);
	}
	if (href && !error) {
		return (
			<Link
				href={href}
				className={className}
				aria-label={accessibleName}
				aria-busy={loading ? "true" : undefined}
			>
				{body}
			</Link>
		);
	}
	return (
		// biome-ignore lint/a11y/useSemanticElements: fieldset is for form controls; a section would add a landmark per card
		<div
			className={className}
			role="group"
			aria-label={accessibleName}
			aria-busy={loading ? "true" : undefined}
		>
			{body}
		</div>
	);
}
