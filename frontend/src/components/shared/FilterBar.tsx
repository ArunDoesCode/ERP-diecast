import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** `count: null` hides the number (the API gives no counts); `undefined` shows "–" while loading. A bar where no chip has a `count` key at all shows no numbers. */
export type QuickFilter = {
	key: string;
	label: string;
	count?: number | null;
};

export type FilterBarProps = {
	quick?: QuickFilter[];
	value: string;
	onChange: (key: string) => void;
	children?: ReactNode;
	onReset?: () => void;
	/** Extra filters (children) are active; with no quick filter selected, Reset still shows. */
	filtersActive?: boolean;
};

export function FilterBar({
	quick,
	value,
	onChange,
	children,
	onReset,
	filtersActive,
}: FilterBarProps) {
	const firstKey = quick?.[0]?.key;
	const noCounts = quick?.every((q) => !("count" in q)) ?? true;
	const active = filtersActive === true || (quick ? value !== firstKey : false);
	return (
		<div
			role="toolbar"
			aria-label="Filters"
			className="flex flex-col gap-3 min-[1280px]:flex-row min-[1280px]:items-center min-[1280px]:justify-between"
		>
			<div className="flex flex-wrap items-center gap-2">
				{quick?.map((q) => {
					const selected = q.key === value;
					return (
						<button
							key={q.key}
							type="button"
							aria-pressed={selected}
							onClick={() => onChange(q.key)}
							className={cn(
								"inline-flex h-9 flex-row-reverse items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
								selected
									? "border-brand-accent bg-brand-accent text-brand-accent-foreground"
									: "border-border bg-card text-foreground hover:bg-muted",
							)}
						>
							{noCounts || q.count === null ? null : (
								<span className="tabular-nums">{q.count ?? "–"}</span>
							)}
							<span>{q.label}</span>
						</button>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{children}
				{active && onReset ? (
					<Button type="button" variant="ghost" size="sm" onClick={onReset}>
						Reset
					</Button>
				) : null}
			</div>
		</div>
	);
}
