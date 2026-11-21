import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type DocumentFlowStep = {
	label: string;
	docNo?: string;
	href?: string;
	status?: ReactNode;
	state: "done" | "current" | "todo";
};

export type DocumentFlowProps = {
	steps: DocumentFlowStep[];
	loading?: boolean;
	error?: boolean;
	onRetry?: () => void;
};

/** Document chain (BR-DS-07, BR-DS-17): current step has the solid accent label strip. */
export function DocumentFlow({
	steps,
	loading,
	error,
	onRetry,
}: DocumentFlowProps) {
	if (loading) {
		return (
			<div aria-busy="true" className="flex flex-wrap gap-3">
				<Skeleton className="h-14 w-44" />
				<Skeleton className="h-14 w-44" />
				<Skeleton className="h-14 w-44" />
			</div>
		);
	}
	if (error) {
		return (
			<div className="flex items-center gap-3 text-[13px] text-muted-foreground">
				<span>Could not load the chain</span>
				{onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						className="rounded-md border border-input px-2 py-1 text-sm font-semibold text-foreground hover:bg-muted"
					>
						Try again
					</button>
				) : null}
			</div>
		);
	}
	if (steps.length < 2) return null;

	return (
		<nav aria-label="Document chain">
			<ol className="flex flex-wrap items-stretch gap-2">
				{steps.map((step) => {
					const docNo = step.docNo ? (
						step.href ? (
							<Link
								href={step.href}
								className="font-mono text-[0.92em] font-medium text-brand-accent hover:underline"
							>
								{step.docNo}
							</Link>
						) : (
							<span className="font-mono text-[0.92em] font-medium">
								{step.docNo}
							</span>
						)
					) : null;
					return (
						<li
							key={`${step.label}-${step.docNo ?? ""}-${step.href ?? ""}`}
							aria-current={step.state === "current" ? "step" : undefined}
							className={cn(
								"flex min-w-40 flex-col overflow-hidden rounded-md border bg-card text-[13px]",
								step.state === "todo" && "border-dashed",
							)}
						>
							<span
								className={cn(
									"px-3 py-1 text-sm font-semibold",
									step.state === "current"
										? "bg-brand-accent text-brand-accent-foreground"
										: "text-muted-foreground",
								)}
							>
								{step.label}
							</span>
							<span className="flex min-h-8 flex-wrap items-center gap-2 px-3 py-1.5">
								{docNo}
								{step.status}
								{!docNo && !step.status ? (
									<span className="text-muted-foreground">Not yet</span>
								) : null}
							</span>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
