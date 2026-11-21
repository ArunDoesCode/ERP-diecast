import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	formatPageRange,
	getPageNumbers,
	PAGE_SIZE_OPTIONS,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

export type PaginationProps = {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (pageSize: number) => void;
	/** Show the "1 to 7 of 7" row even when everything fits on one page. */
	alwaysShow?: boolean;
};

const ARROW =
	"inline-flex size-8 items-center justify-center rounded-md border border-border text-sm hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50";

export function Pagination({
	page,
	pageSize,
	total,
	onPageChange,
	onPageSizeChange,
	alwaysShow,
}: PaginationProps) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	// Hidden when total <= page size (BR-FF-105) unless `alwaysShow` (DES-60); a stale ?page beyond the last page
	// keeps the nav so the user can get back.
	const fitsOnePage = total <= pageSize && page <= 1;
	const showSizeSelect = onPageSizeChange !== undefined;
	if (total <= 0 || (!alwaysShow && fitsOnePage)) return null;
	const atStart = page <= 1;
	const atEnd = page >= pageCount;
	const numbers = getPageNumbers(page, pageCount);

	return (
		<div className="flex flex-col items-center justify-between gap-3 py-2 sm:flex-row">
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<span className="tabular-nums">
					{formatPageRange(page, pageSize, total)}
				</span>
				{onPageSizeChange && showSizeSelect ? (
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
			{fitsOnePage ? null : (
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
								className="px-1 text-sm text-muted-foreground"
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
			)}
		</div>
	);
}
