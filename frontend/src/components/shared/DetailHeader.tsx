import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export type DetailMeta = { label: string; value: ReactNode };

export type DetailHeaderProps = {
	docNo: string;
	/** Show `docNo` as plain text, not mono (a name, not a document number). */
	docNoPlain?: boolean;
	title?: string;
	status: ReactNode;
	meta?: DetailMeta[];
	actions?: ReactNode;
	backHref: string;
	backLabel: string;
	loading?: boolean;
};

/** Detail page header (BR-DS-08): back link, mono document number (the only h1), status, meta pairs, actions. */
export function DetailHeader({
	docNo,
	docNoPlain,
	title,
	status,
	meta,
	actions,
	backHref,
	backLabel,
	loading,
}: DetailHeaderProps) {
	const metaItems = (meta ?? []).slice(0, 4);
	return (
		<header className="flex flex-col gap-3" aria-busy={loading || undefined}>
			<Link
				href={backHref}
				className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<IconArrowLeft size={14} aria-hidden="true" />
				Back to {backLabel}
			</Link>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						{loading ? (
							<Skeleton className="h-8 w-48" />
						) : (
							<>
								<h1
									className={
										docNoPlain
											? "text-2xl leading-8 font-bold"
											: "font-mono text-2xl leading-8 font-bold tabular-nums"
									}
								>
									{docNo}
								</h1>
								{status}
							</>
						)}
					</div>
					<div aria-hidden="true" className="mt-1 h-0.5 w-10 bg-brand-accent" />
					{title ? (
						<p className="mt-2 text-[13px] text-muted-foreground">{title}</p>
					) : null}
				</div>
				{actions ? (
					// biome-ignore lint/a11y/useSemanticElements: spec names this a role="group" (a fieldset would add form semantics)
					<div
						role="group"
						aria-label="Page actions"
						className="flex flex-wrap items-center gap-2"
					>
						{actions}
					</div>
				) : null}
			</div>
			{loading ? (
				<Skeleton className="h-4 w-80 max-w-full" />
			) : metaItems.length > 0 ? (
				<dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
					{metaItems.map((m) => (
						<div key={m.label} className="flex gap-1.5">
							<dt className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								{m.label}
							</dt>
							<dd className="tabular-nums">{m.value}</dd>
						</div>
					))}
				</dl>
			) : null}
		</header>
	);
}
