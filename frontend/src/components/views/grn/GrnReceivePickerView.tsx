"use client";

import { IconPackage, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { useEffect, useRef, useState } from "react";
import { ReceivePickerRow } from "@/components/pages/grn/ReceivePickerRow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useReceivablePosQuery } from "@/lib/api/grn/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

const BUCKETS = ["all", "late", "today"] as const;
const BUCKET_LABEL = { all: "All", late: "Late", today: "Today" } as const;
const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5"] as const;

export function GrnReceivePickerView() {
	const canReceive = useCan("grn.edit_draft");
	const canSeePos = useCan("po.manage");

	const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
	const [pageSize, setPageSize] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
	);
	const [bucketRaw, setBucket] = useQueryState(
		"bucket",
		parseAsStringLiteral(BUCKETS).withDefault("all"),
	);
	const [urlQ, setUrlQ] = useQueryState("q", parseAsString.withDefault(""));
	const [qInput, setQInput] = useState(urlQ);
	const debouncedQ = useDebouncedValue(qInput, 350).trim();
	// A row link was clicked: the pending URL sync must not overwrite that navigation.
	const leaving = useRef(false);

	const bucket = bucketRaw === "all" ? undefined : bucketRaw;
	const query = useReceivablePosQuery(
		{
			page,
			pageSize,
			sortBy: "dueDate",
			sortDir: "asc",
			q: debouncedQ || undefined,
			bucket,
		},
		canReceive,
	);

	// Keep the URL in step with the debounced box (not on every key).
	useEffect(() => {
		if (debouncedQ === urlQ || leaving.current) return;
		void setUrlQ(debouncedQ || null);
		void setPage(1);
	}, [debouncedQ, urlQ, setUrlQ, setPage]);

	const rows = query.data?.data ?? [];
	const total = query.data?.meta.total ?? 0;
	const today = query.data?.meta.today;
	const filtersActive = bucket !== undefined || debouncedQ !== "";

	if (!canReceive) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Receive goods" />
				<p className="text-sm text-muted-foreground">
					You do not have access to receive goods.{" "}
					<Link href="/grn" className="text-brand-accent hover:underline">
						Back to goods receipts
					</Link>
				</p>
			</div>
		);
	}

	return (
		<div
			className="flex w-full flex-col gap-4"
			onClickCapture={(event) => {
				if ((event.target as HTMLElement).closest("a[href]"))
					leaving.current = true;
			}}
		>
			<PageHeader
				title="Receive goods"
				description="Pick the order that arrived. Oldest due date first."
				actions={
					<Button asChild variant="outline" size="lg">
						<Link href="/grn">Back to goods receipts</Link>
					</Button>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<div className="relative w-72 max-w-full">
					<IconSearch
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={qInput}
						onChange={(event) => setQInput(event.target.value)}
						placeholder="Search order number or supplier"
						aria-label="Search order number or supplier"
						className="h-10 pl-9"
					/>
				</div>
				<fieldset className="m-0 flex items-center gap-2 border-0 p-0">
					<legend className="sr-only">Due filter</legend>
					{BUCKETS.map((value) => (
						<Button
							key={value}
							type="button"
							size="lg"
							variant={bucketRaw === value ? "default" : "outline"}
							aria-pressed={bucketRaw === value}
							onClick={() => {
								void setBucket(value === "all" ? null : value);
								void setPage(1);
							}}
						>
							{BUCKET_LABEL[value]}
						</Button>
					))}
				</fieldset>
			</div>

			{query.isLoading ? (
				<div className="space-y-2">
					{SKELETON_KEYS.map((key) => (
						<Skeleton key={key} className="h-11 w-full" />
					))}
				</div>
			) : query.isError ? (
				<ErrorState
					message={
						query.error instanceof Error
							? query.error.message
							: "The orders could not be loaded."
					}
					onRetry={() => {
						void query.refetch();
					}}
					retrying={query.isRefetching}
				/>
			) : rows.length === 0 ? (
				filtersActive ? (
					<EmptyState
						icon={IconPackage}
						title="No orders match"
						action={
							<Button
								type="button"
								variant="outline"
								size="lg"
								onClick={() => {
									setQInput("");
									void setUrlQ(null);
									void setBucket(null);
									void setPage(1);
								}}
							>
								Clear filters
							</Button>
						}
					/>
				) : (
					<EmptyState
						icon={IconPackage}
						title="No orders are waiting for goods"
						action={
							canSeePos ? (
								<Link
									href="/purchase-orders"
									className="text-sm text-brand-accent hover:underline"
								>
									Orders to send
								</Link>
							) : undefined
						}
					/>
				)
			) : (
				<ul className="rounded-md border">
					{rows.map((po) => (
						<ReceivePickerRow key={po.poId} po={po} today={today} />
					))}
				</ul>
			)}

			<Pagination
				page={page}
				pageSize={pageSize}
				total={total}
				onPageChange={(next) => {
					void setPage(next);
				}}
				onPageSizeChange={(next) => {
					void setPageSize(next);
					void setPage(1);
				}}
			/>
		</div>
	);
}
