"use client";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaginationMeta } from "@/types/suppliers";

type SuppliersPaginationProps = {
  page: number;
  pageSize: number;
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function getVisiblePages(currentPage: number, totalPages: number) {
  const start = Math.max(currentPage - 1, 1);
  const end = Math.min(start + 2, totalPages);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function SuppliersPagination({
  page,
  pageSize,
  meta,
  onPageChange,
  onPageSizeChange,
}: SuppliersPaginationProps) {
  const totalPages = Math.max(meta?.totalPages ?? 1, 1);
  const currentPage = Math.min(page, totalPages);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue placeholder="10" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={!canGoPrevious}
              className={
                !canGoPrevious ? "pointer-events-none opacity-50" : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                if (!canGoPrevious) return;
                onPageChange(currentPage - 1);
              }}
            />
          </PaginationItem>

          {visiblePages.map((pageNumber) => (
            <PaginationItem key={pageNumber}>
              <PaginationLink
                href="#"
                isActive={pageNumber === currentPage}
                onClick={(event) => {
                  event.preventDefault();
                  onPageChange(pageNumber);
                }}
              >
                {pageNumber}
              </PaginationLink>
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={!canGoNext}
              className={
                !canGoNext ? "pointer-events-none opacity-50" : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                if (!canGoNext) return;
                onPageChange(currentPage + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <p className="text-xs text-muted-foreground">
        Total: {meta?.total ?? 0} suppliers
      </p>
    </div>
  );
}
