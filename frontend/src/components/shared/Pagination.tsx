import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatPageRange, getPageNumbers } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export type PaginationProps = {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (pageSize: number) => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const ARROW =
	"inline-flex size-7 items-center justify-center rounded-md border border-border text-xs hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50";

export function Pagination({
	page,
	pageSize,
	total,
	onPageChange,
	onPageSizeChange,
}: PaginationProps) {
	if (total <= pageSize) return null;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const atStart = page <= 1;
	const atEnd = page >= pageCount;
	const numbers = getPageNumbers(page, pageCount);

	return (
		<div className="flex flex-col items-center justify-between gap-3 py-2 sm:flex-row">
			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<span className="tabular-nums">
					{formatPageRange(page, pageSize, total)}
				</span>
				{onPageSizeChange ? (
					<Select
						value={String(pageSize)}
						onValueChange={(v) => onPageSizeChange(Number(v))}
					>
						<SelectTrigger className="w-24" aria-label="Rows per page">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PAGE_SIZE_OPTIONS.map((n) => (
								<SelectItem key={n} value={String(n)}>
									{n} / page
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>
			<nav aria-label="Pagination" className="flex items-center gap-1">
				<button
					type="button"
					aria-label="Previous page"
					aria-disabled={atStart}
					onClick={() => {
						if (!atStart) onPageChange(page - 1);
					}}
					className={ARROW}
				>
					<IconChevronLeft size={14} aria-hidden="true" />
				</button>
				{numbers.map((n, i) =>
					n === null ? (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: gaps are positional
							key={`gap-${i}`}
							aria-hidden="true"
							className="px-1 text-xs text-muted-foreground"
						>
							…
						</span>
					) : (
						<button
							key={n}
							type="button"
							aria-current={n === page ? "page" : undefined}
							onClick={() => onPageChange(n)}
							className={cn(
								ARROW,
								"tabular-nums",
								n === page &&
									"border-brand-accent bg-brand-accent text-brand-accent-foreground hover:bg-brand-accent",
							)}
						>
							{n}
						</button>
					),
				)}
				<button
					type="button"
					aria-label="Next page"
					aria-disabled={atEnd}
					onClick={() => {
						if (!atEnd) onPageChange(page + 1);
					}}
					className={ARROW}
				>
					<IconChevronRight size={14} aria-hidden="true" />
				</button>
			</nav>
		</div>
	);
}
