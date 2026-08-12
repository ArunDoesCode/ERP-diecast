"use client";

import { IconSearch } from "@tabler/icons-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useEmployeeSearchQuery } from "@/lib/api/setup/queries";
import { cn } from "@/lib/utils";
import type { Employee } from "@/types/setup";

// keep this the single place page size is tuned for the search dropdown
const PAGE_SIZE = 10;
const SCROLL_LOAD_THRESHOLD_PX = 48;

type EmployeeComboboxProps = {
	search: string;
	onSearchChange: (value: string) => void;
	onSelect: (employee: Employee) => void;
};

export function EmployeeCombobox({
	search,
	onSearchChange,
	onSelect,
}: EmployeeComboboxProps) {
	const [open, setOpen] = React.useState(false);
	const debouncedSearch = useDebouncedValue(search, 500);

	const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useEmployeeSearchQuery(debouncedSearch, PAGE_SIZE);

	const hasQuery = debouncedSearch.trim().length > 0;
	const employees = data?.pages.flatMap((page) => page.data) ?? [];

	function handleSelect(employee: Employee) {
		onSelect(employee);
		setOpen(false);
		onSearchChange(employee.name);
	}

	function handleScroll(event: React.UIEvent<HTMLDivElement>) {
		const el = event.currentTarget;
		const nearBottom =
			el.scrollHeight - el.scrollTop - el.clientHeight <
			SCROLL_LOAD_THRESHOLD_PX;
		if (nearBottom && hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}

	return (
		<div className="relative max-w-xs">
			<IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder="Search employees..."
				value={search}
				onChange={(event) => {
					onSearchChange(event.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				className="pl-7"
			/>

			{open ? (
				<div className="absolute z-50 mt-1 w-full rounded-lg bg-popover p-1 text-xs/relaxed text-popover-foreground shadow-md ring-1 ring-foreground/10">
					{!hasQuery ? (
						<p className="p-2 text-xs/relaxed text-muted-foreground">
							Type to search employees...
						</p>
					) : isLoading ? (
						<p className="p-2 text-xs/relaxed text-muted-foreground">
							Loading employees...
						</p>
					) : employees.length === 0 ? (
						<p className="p-2 text-xs/relaxed text-muted-foreground">
							No employees found.
						</p>
					) : (
						<div
							onScroll={handleScroll}
							className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
						>
							{employees.map((employee) => (
								<button
									key={employee.id}
									type="button"
									// fires before the input's onBlur, so the click still registers
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => handleSelect(employee)}
									className={cn(
										"flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs/relaxed hover:bg-accent hover:text-accent-foreground",
									)}
								>
									{employee.name}
								</button>
							))}
							{isFetchingNextPage ? (
								<Skeleton className="mx-2 h-6 shrink-0 rounded-md" />
							) : null}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
