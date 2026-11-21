"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rfqErrorMessage, usePrLinesQuery } from "@/lib/api/rfq/queries";
import { formatQtyTrim } from "@/lib/format";
import type { PrLineRow } from "@/types/rfq";

const PAGE_SIZE = 10;

/** Pending lines of approved / partly ordered requisitions. A line on another open RFQ is disabled (BR-RFQ-01, 02). */
export function RfqLinePickerDialog({
	open,
	onOpenChange,
	selectedIds,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedIds: number[];
	onAdd: (lines: PrLineRow[]) => void;
}) {
	const canViewRfq = useCan("rfq.view");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [picked, setPicked] = useState<Map<number, PrLineRow>>(new Map());
	const debounced = useDebouncedValue(search, 300);
	const query = usePrLinesQuery(
		{
			page,
			pageSize: PAGE_SIZE,
			sortBy: "prNumber",
			q: debounced.trim().length >= 2 ? debounced.trim() : undefined,
		},
		open,
	);
	const rows = query.data?.data ?? [];

	function toggle(row: PrLineRow, on: boolean) {
		setPicked((current) => {
			const next = new Map(current);
			if (on) next.set(row.id, row);
			else next.delete(row.id);
			return next;
		});
	}

	function close(next: boolean) {
		if (!next) {
			setPicked(new Map());
			setSearch("");
			setPage(1);
		}
		onOpenChange(next);
	}

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="min-w-[min(48rem,calc(100vw-2rem))]">
				<DialogHeader>
					<DialogTitle>Add requisition lines</DialogTitle>
					<DialogDescription>
						Pending lines of approved requisitions.
					</DialogDescription>
				</DialogHeader>
				<Input
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
						setPage(1);
					}}
					maxLength={100}
					placeholder="Search PR no. or item"
					aria-label="Search requisition lines"
				/>
				{query.isLoading ? (
					<div aria-busy="true" className="space-y-1">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				) : query.isError ? (
					<ErrorState
						message={rfqErrorMessage(
							query.error,
							"The lines could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				) : rows.length === 0 ? (
					<EmptyState title="No pending requisition lines" />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">
									<span className="sr-only">Pick</span>
								</TableHead>
								<TableHead>PR no.</TableHead>
								<TableHead>Item</TableHead>
								<TableHead className="text-right">Qty</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const already = selectedIds.includes(row.id);
								const blocked = row.onOpenRfq;
								const disabled = already || blocked;
								return (
									<TableRow key={row.id}>
										<TableCell>
											<Checkbox
												aria-label={`Pick ${row.prNumber} ${row.itemCode}`}
												disabled={disabled}
												checked={already || picked.has(row.id)}
												onCheckedChange={(on) => toggle(row, on === true)}
											/>
										</TableCell>
										<TableCell className="font-mono">{row.prNumber}</TableCell>
										<TableCell>
											{row.itemCode} · {row.itemName}
											{blocked ? (
												<span className="block text-[13px] text-muted-foreground">
													On{" "}
													{canViewRfq && row.openRfqId ? (
														<Link
															href={`/rfq/${row.openRfqId}`}
															className="font-mono text-brand-accent hover:underline"
														>
															{row.openRfqNumber}
														</Link>
													) : (
														<span className="font-mono">
															{row.openRfqNumber}
														</span>
													)}
												</span>
											) : already ? (
												<span className="block text-[13px] text-muted-foreground">
													Already on this RFQ
												</span>
											) : null}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatQtyTrim(row.qty, row.uom)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
				<Pagination
					page={page}
					pageSize={PAGE_SIZE}
					total={query.data?.meta.total ?? 0}
					onPageChange={setPage}
				/>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => close(false)}>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={picked.size === 0}
						onClick={() => {
							onAdd([...picked.values()]);
							close(false);
						}}
					>
						Add {picked.size > 0 ? picked.size : ""} line
						{picked.size === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
