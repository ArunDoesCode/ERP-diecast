"use client";

import type { Table } from "@tanstack/react-table";

import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

type DataTablePaginationProps<TData> = {
	table: Table<TData>;
};

const DOTS = "dots" as const;

// Classic sliding-window pagination range: always show first/last page, a window of
// `siblingCount` pages either side of the current page, and collapse any gaps to "...".
function getPageNumbers(
	current: number,
	total: number,
	siblingCount = 1,
): (number | typeof DOTS)[] {
	const totalVisible = siblingCount * 2 + 5;

	if (total <= totalVisible) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	const leftSibling = Math.max(current - siblingCount, 1);
	const rightSibling = Math.min(current + siblingCount, total);
	const showLeftDots = leftSibling > 2;
	const showRightDots = rightSibling < total - 1;

	if (!showLeftDots && showRightDots) {
		const leftRange = Array.from(
			{ length: 3 + siblingCount * 2 },
			(_, i) => i + 1,
		);
		return [...leftRange, DOTS, total];
	}

	if (showLeftDots && !showRightDots) {
		const rightCount = 3 + siblingCount * 2;
		const rightRange = Array.from(
			{ length: rightCount },
			(_, i) => total - rightCount + i + 1,
		);
		return [1, DOTS, ...rightRange];
	}

	const middleRange = Array.from(
		{ length: rightSibling - leftSibling + 1 },
		(_, i) => leftSibling + i,
	);
	return [1, DOTS, ...middleRange, DOTS, total];
}

export function DataTablePagination<TData>({
	table,
}: DataTablePaginationProps<TData>) {
	const currentPage = table.getState().pagination.pageIndex + 1;
	const totalPages = table.getPageCount();
	const canPreviousPage = table.getCanPreviousPage();
	const canNextPage = table.getCanNextPage();
	const pageNumbers = getPageNumbers(currentPage, totalPages);

	return (
		<div className="flex items-center justify-center py-4">
			<Pagination className="mx-0 w-auto">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							href="#"
							aria-disabled={!canPreviousPage}
							className={cn(
								!canPreviousPage && "pointer-events-none opacity-50",
							)}
							onClick={(e) => {
								e.preventDefault();
								table.previousPage();
							}}
						/>
					</PaginationItem>

					{pageNumbers.map((page, index) =>
						page === DOTS ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: dots are fixed non-reorderable positions
							<PaginationItem key={`dots-${index}`}>
								<PaginationEllipsis />
							</PaginationItem>
						) : (
							<PaginationItem key={page}>
								<PaginationLink
									href="#"
									isActive={page === currentPage}
									onClick={(e) => {
										e.preventDefault();
										table.setPageIndex(page - 1);
									}}
								>
									{page}
								</PaginationLink>
							</PaginationItem>
						),
					)}

					<PaginationItem>
						<PaginationNext
							href="#"
							aria-disabled={!canNextPage}
							className={cn(!canNextPage && "pointer-events-none opacity-50")}
							onClick={(e) => {
								e.preventDefault();
								table.nextPage();
							}}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}
