"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useBomNeedsQuery } from "@/lib/api/bom/queries";
import { ApiClientError } from "@/lib/api/client";
import { formatQty } from "@/lib/format";
import type { BomNeedsParams, BomStatus, BomTreatment } from "@/types/bom";
import { formatBomQty } from "./bom-format";

const DO_LABELS: Record<BomTreatment, string> = {
	cast: "Cast",
	job_work: "Send",
	assemble: "Assemble",
	buy: "Buy",
	buy_as_is: "Buy",
	no_bom: "Buy",
	loop: "Loop",
};

const MAX_PIECES = 1_000_000;

export function BomNeedsPanel({
	partId,
	selectedStatus,
	activeBomId,
	activeHref,
}: {
	partId: number;
	selectedStatus: BomStatus;
	activeBomId: number | null;
	activeHref: string | null;
}) {
	const [pieces, setPieces] = useState("");
	const [params, setParams] = useState<BomNeedsParams | null>(null);
	const [inputError, setInputError] = useState<string | null>(null);
	const query = useBomNeedsQuery(params);

	function calculate(event?: FormEvent) {
		event?.preventDefault();
		const qty = Number(pieces);
		if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PIECES) {
			setInputError("Enter a whole number from 1 to 1,000,000");
			return;
		}
		setInputError(null);
		setParams({ partId, qty, levels: "all" });
	}

	const noActive =
		activeBomId === null ||
		(query.error instanceof ApiClientError &&
			query.error.code === "NO_ACTIVE_BOM");
	const result = query.data?.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Needs preview</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{selectedStatus !== "active" && activeBomId !== null && activeHref ? (
					<p className="text-sm text-muted-foreground">
						Needs preview uses the active revision.{" "}
						<Link
							href={activeHref}
							className="text-brand-accent hover:underline"
						>
							Open active revision
						</Link>
					</p>
				) : null}
				{noActive ? (
					<p className="text-sm text-muted-foreground">
						No active revision, release one to preview needs
					</p>
				) : (
					<form onSubmit={calculate} className="flex items-end gap-2">
						<div className="min-h-19 flex-1 space-y-1">
							<Label htmlFor="bom-needs-pieces">Pieces</Label>
							<Input
								id="bom-needs-pieces"
								inputMode="numeric"
								value={pieces}
								onChange={(event) => setPieces(event.target.value)}
								aria-invalid={inputError ? true : undefined}
								className="text-right tabular-nums"
							/>
							{inputError ? (
								<p className="text-[13px] text-destructive">{inputError}</p>
							) : null}
						</div>
						<Button
							type="submit"
							size="sm"
							variant="secondary"
							className="mb-5"
							disabled={query.isFetching}
						>
							{query.isFetching ? "Calculating…" : "Calculate"}
						</Button>
					</form>
				)}

				{query.isFetching && !result ? <Skeleton className="h-16" /> : null}
				{query.isError && !noActive ? (
					<p role="alert" className="text-sm text-destructive">
						{query.error instanceof Error
							? query.error.message
							: "Needs could not be calculated."}
					</p>
				) : null}
				{!result && !query.isFetching && !query.isError && !noActive ? (
					<p className="text-sm text-muted-foreground">
						Enter pieces and press Calculate
					</p>
				) : null}

				{result ? (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Part</TableHead>
									<TableHead>Do</TableHead>
									<TableHead className="text-right">Qty</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result.rows.map((row) => (
									<TableRow key={row.index}>
										<TableCell>
											<span style={{ paddingLeft: `${row.level * 16}px` }}>
												{row.sku}
											</span>
											{row.treatment === "no_bom" ||
											row.treatment === "loop" ? (
												<StatusBadge
													doc="bomNode"
													status={row.treatment}
													className="ml-2"
												/>
											) : null}
										</TableCell>
										<TableCell>{DO_LABELS[row.treatment]}</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatBomQty(row.qty, row.unit)}
											{row.treatment === "cast" && row.pourQty !== undefined ? (
												<span className="block text-[13px] text-muted-foreground">
													Pour {formatQty(row.pourQty, null, 0)}
													{row.alloyKg !== undefined
														? ` · alloy ${formatQty(row.alloyKg, "kg", 3)}`
														: ""}
												</span>
											) : null}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<div>
							<p className="mb-1 text-sm font-medium">To buy</p>
							{result.toBuy.length === 0 ? (
								<p className="text-sm text-muted-foreground">Nothing to buy.</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Item</TableHead>
											<TableHead className="text-right">Qty</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{result.toBuy.map((item) => (
											<TableRow key={item.itemId}>
												<TableCell>
													{item.sku}
													{item.noBom ? (
														<StatusBadge
															doc="bomNode"
															status="no_bom"
															className="ml-2"
														/>
													) : null}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatBomQty(item.qty, item.unit)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</div>
					</>
				) : null}
				<p className="text-[13px] text-muted-foreground">
					Reads no stock, creates nothing.
				</p>
			</CardContent>
		</Card>
	);
}
