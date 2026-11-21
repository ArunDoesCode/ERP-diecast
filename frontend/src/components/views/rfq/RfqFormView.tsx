"use client";

import { IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RfqLinePickerDialog } from "@/components/pages/rfq/RfqLinePickerDialog";
import { SupplierPicker } from "@/components/pages/rfq/SupplierPicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	rfqErrorMessage,
	useCreateRfqMutation,
	usePrLinesQuery,
	useRfqQuery,
	useUpdateRfqMutation,
} from "@/lib/api/rfq/queries";
import { formatMoney, formatQty } from "@/lib/format";
import { istTodayIso } from "@/lib/ist-date";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import {
	type ContractHint,
	type PrLineRow,
	RFQ_MAX_SUPPLIERS,
	RFQ_NOTES_MAX,
} from "@/types/rfq";

type FormLine = {
	prItemId: number;
	prNumber: string;
	itemCode: string;
	itemName: string;
	qty: number;
	uom: string;
	hints: ContractHint[];
};
type FormSupplier = { id: number; name: string };

function fromPrLine(row: PrLineRow): FormLine {
	return {
		prItemId: row.id,
		prNumber: row.prNumber,
		itemCode: row.itemCode,
		itemName: row.itemName,
		qty: row.qty,
		uom: row.uom,
		hints: [],
	};
}

/** New RFQ (`/rfq/new?pr=`) or edit of a draft (`/rfq/[id]/edit`). Lines and suppliers lock once sent (BR-RFQ-06). */
export function RfqFormView({
	rfqId,
	prId,
}: {
	rfqId?: number;
	prId?: number;
}) {
	const router = useRouter();
	const canManage = useCan("rfq.manage");
	const isEdit = rfqId !== undefined;
	const details = useRfqQuery(canManage && isEdit ? rfqId : undefined);
	const prLines = usePrLinesQuery(
		{ prId, onOpenRfq: false, pageSize: 100, sortBy: "id" },
		canManage && !isEdit && prId !== undefined,
	);
	const create = useCreateRfqMutation();
	const update = useUpdateRfqMutation();

	const [dueDate, setDueDate] = useState("");
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState<FormLine[]>([]);
	const [suppliers, setSuppliers] = useState<FormSupplier[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const initial = useRef<{ lines: number[]; suppliers: number[] } | null>(null);
	const seeded = useRef(false);

	const rfq = details.data?.data;
	useBreadcrumbLast(isEdit ? rfq?.rfq.rfqNumber : "New RFQ");

	// Edit route of a sent RFQ goes to its detail (BR-RFQ-06).
	const sentRfqId = rfq && rfq.rfq.status !== "draft" ? rfq.rfq.id : undefined;
	useEffect(() => {
		if (sentRfqId !== undefined) router.replace(`/rfq/${sentRfqId}`);
	}, [sentRfqId, router]);

	// Edit: load the saved draft once.
	useEffect(() => {
		if (!rfq || seeded.current) return;
		seeded.current = true;
		const hints = new Map(
			(rfq.lineRates ?? []).map((rate) => [rate.rfqItemId, rate.contract]),
		);
		setDueDate(rfq.rfq.dueDate);
		setNotes(rfq.rfq.notes ?? "");
		setLines(
			rfq.lines.map((line) => ({
				prItemId: line.prItemId,
				prNumber: line.prNumber,
				itemCode: line.itemCode,
				itemName: line.itemName,
				qty: line.qty,
				uom: line.uom,
				hints: hints.get(line.id) ?? [],
			})),
		);
		setSuppliers(
			rfq.suppliers.map((s) => ({ id: s.supplierId, name: s.name })),
		);
		initial.current = {
			lines: rfq.lines.map((line) => line.prItemId),
			suppliers: rfq.suppliers.map((s) => s.supplierId),
		};
	}, [rfq]);

	// Arrival from a requisition: its pending lines start ticked.
	const prRows = prLines.data?.data;
	useEffect(() => {
		if (!prRows || seeded.current) return;
		seeded.current = true;
		setLines(prRows.map(fromPrLine));
	}, [prRows]);

	if (!canManage) {
		return <NoAccessState what="RFQ entry" />;
	}
	if (isEdit && details.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Edit RFQ" />
				<Skeleton className="h-40" />
				<Skeleton className="h-40" />
			</div>
		);
	}
	if (isEdit && (details.isError || !rfq)) {
		const notFound =
			details.error instanceof ApiClientError && details.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Edit RFQ" />
				{notFound ? (
					<EmptyState title="RFQ not found" />
				) : (
					<ErrorState
						message={rfqErrorMessage(
							details.error,
							"The RFQ could not be loaded.",
						)}
						onRetry={() => {
							void details.refetch();
						}}
						retrying={details.isRefetching}
					/>
				)}
			</div>
		);
	}
	if (rfq && rfq.rfq.status !== "draft") {
		return <Skeleton className="h-40" />;
	}

	const today = istTodayIso();
	const dueError =
		submitted && (dueDate === "" || dueDate < today)
			? "Pick a due date that is not before today."
			: null;
	const linesError =
		submitted && lines.length === 0
			? "Add at least one requisition line."
			: null;
	const suppliersError =
		submitted && suppliers.length === 0 ? "Add at least one supplier." : null;
	const pending = create.isPending || update.isPending;

	function save() {
		setSubmitted(true);
		setError(null);
		if (dueDate === "" || dueDate < today) return;
		if (lines.length === 0 || suppliers.length === 0) return;
		const trimmedNotes = notes.trim();
		const onError = (err: unknown) =>
			setError(rfqErrorMessage(err, "The RFQ could not be saved."));
		if (rfqId !== undefined && initial.current) {
			const was = initial.current;
			const lineIds = lines.map((line) => line.prItemId);
			const supplierIds = suppliers.map((s) => s.id);
			const diff = (a: number[], b: number[]) =>
				a.filter((x) => !b.includes(x));
			update.mutate(
				{
					id: rfqId,
					dueDate,
					notes: trimmedNotes,
					addPrItemIds: diff(lineIds, was.lines),
					removePrItemIds: diff(was.lines, lineIds),
					addSupplierIds: diff(supplierIds, was.suppliers),
					removeSupplierIds: diff(was.suppliers, supplierIds),
				},
				{ onSuccess: () => router.push(`/rfq/${rfqId}`), onError },
			);
			return;
		}
		create.mutate(
			{
				dueDate,
				notes: trimmedNotes || undefined,
				supplierIds: suppliers.map((s) => s.id),
				prItemIds: lines.map((line) => line.prItemId),
			},
			{
				onSuccess: (result) => router.push(`/rfq/${result.data.id}`),
				onError,
			},
		);
	}

	const cancelHref = rfqId !== undefined ? `/rfq/${rfqId}` : "/rfq";

	return (
		<form
			className="flex w-full max-w-5xl flex-col gap-4"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			<PageHeader
				title={isEdit ? `Edit ${rfq?.rfq.rfqNumber ?? "RFQ"}` : "New RFQ"}
				description="Pick the requisition lines and the suppliers to ask."
			/>

			<Card>
				<CardContent className="grid gap-4 pt-4 md:grid-cols-2">
					<div className="min-h-19 space-y-1">
						<Label htmlFor="rfq-due">Quote due date *</Label>
						<Input
							id="rfq-due"
							type="date"
							min={today}
							value={dueDate}
							aria-invalid={dueError ? true : undefined}
							onChange={(event) => setDueDate(event.target.value)}
						/>
						{dueError ? (
							<p className="text-[13px] text-destructive">{dueError}</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="rfq-notes">Notes</Label>
						<Textarea
							id="rfq-notes"
							value={notes}
							maxLength={RFQ_NOTES_MAX}
							onChange={(event) => setNotes(event.target.value)}
						/>
						<p className="text-right text-[13px] text-muted-foreground tabular-nums">
							{notes.length} / {RFQ_NOTES_MAX}
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex-row items-center justify-between gap-2">
					<CardTitle>Lines ({lines.length})</CardTitle>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setPickerOpen(true)}
					>
						Add PR lines
					</Button>
				</CardHeader>
				<CardContent className="space-y-2">
					{lines.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No lines yet. Add lines from approved requisitions.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>PR no.</TableHead>
									<TableHead>Item</TableHead>
									<TableHead className="text-right">Qty</TableHead>
									<TableHead>Contract</TableHead>
									<TableHead>
										<span className="sr-only">Remove</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{lines.map((line) => (
									<TableRow key={line.prItemId}>
										<TableCell className="font-mono">{line.prNumber}</TableCell>
										<TableCell>
											{line.itemCode} · {line.itemName}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatQty(line.qty, line.uom, 3)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{line.hints.length === 0
												? "–"
												: line.hints
														.map(
															(hint) =>
																`${hint.contractNumber} ${formatMoney(hint.ratePaise)}`,
														)
														.join(", ")}
										</TableCell>
										<TableCell className="text-right">
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label={`Remove ${line.prNumber} ${line.itemCode}`}
												onClick={() =>
													setLines((current) =>
														current.filter((l) => l.prItemId !== line.prItemId),
													)
												}
											>
												<IconX />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					{linesError ? (
						<p role="alert" className="text-[13px] text-destructive">
							{linesError}
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>
						Suppliers ({suppliers.length} of {RFQ_MAX_SUPPLIERS})
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<ul className="flex flex-wrap gap-2">
						{suppliers.map((supplier) => (
							<li
								key={supplier.id}
								className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card pr-1 pl-3 text-sm"
							>
								{supplier.name}
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove ${supplier.name}`}
									onClick={() =>
										setSuppliers((current) =>
											current.filter((s) => s.id !== supplier.id),
										)
									}
								>
									<IconX />
								</Button>
							</li>
						))}
					</ul>
					{suppliers.length < RFQ_MAX_SUPPLIERS ? (
						<div className="max-w-sm min-h-19 space-y-1">
							<Label htmlFor="rfq-supplier">Add supplier</Label>
							<SupplierPicker
								id="rfq-supplier"
								placeholder="Select supplier"
								exclude={suppliers.map((s) => s.id)}
								onChange={(supplier) =>
									setSuppliers((current) =>
										current.some((s) => s.id === supplier.id)
											? current
											: [...current, { id: supplier.id, name: supplier.name }],
									)
								}
							/>
						</div>
					) : null}
					{suppliersError ? (
						<p role="alert" className="text-[13px] text-destructive">
							{suppliersError}
						</p>
					) : null}
				</CardContent>
			</Card>

			{error ? (
				<div
					role="alert"
					className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
				>
					{error}
				</div>
			) : null}

			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" asChild>
					<Link href={cancelHref}>Cancel</Link>
				</Button>
				<Button type="submit" disabled={pending}>
					{pending ? "Saving…" : "Save draft"}
				</Button>
			</div>

			<RfqLinePickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				selectedIds={lines.map((line) => line.prItemId)}
				onAdd={(added) =>
					setLines((current) => [
						...current,
						...added
							.filter((row) => !current.some((l) => l.prItemId === row.id))
							.map(fromPrLine),
					])
				}
			/>
		</form>
	);
}
