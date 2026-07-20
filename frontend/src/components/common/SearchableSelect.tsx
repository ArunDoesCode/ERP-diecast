"use client";

import { IconCheck } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SCROLL_LOAD_THRESHOLD_PX = 48;

export type SearchableSelectOption = {
  value: string;
  label: string;
  secondaryLabel?: string;
};

type SearchableSelectProps = {
  value?: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText?: string;
  disabled?: boolean;
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onReachEnd?: () => void;
  className?: string;
};

export function SearchableSelect({
  value,
  options,
  onValueChange,
  searchValue,
  onSearchChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No options found.",
  disabled,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onReachEnd,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!onReachEnd || !hasNextPage || isFetchingNextPage) return;

    const container = event.currentTarget;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      SCROLL_LOAD_THRESHOLD_PX;

    if (nearBottom) {
      onReachEnd();
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-2"
        align="start"
      >
        <div className="flex flex-col gap-2">
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />

          {isLoading ? (
            <div className="space-y-1">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : options.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            <div
              className="max-h-56 space-y-1 overflow-y-auto"
              onScroll={handleScroll}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="flex flex-col">
                    <span>{option.label}</span>
                    {option.secondaryLabel ? (
                      <span className="text-[11px] text-muted-foreground">
                        {option.secondaryLabel}
                      </span>
                    ) : null}
                  </span>

                  {option.value === value ? (
                    <IconCheck className="size-3.5" />
                  ) : null}
                </button>
              ))}

              {isFetchingNextPage ? <Skeleton className="h-8 w-full" /> : null}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
