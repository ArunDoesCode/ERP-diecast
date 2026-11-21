"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { QuoteLinesTable } from "@/components/pages/rfq/QuoteLinesTable";
import {
	emptyRows,
	type QuoteRow,
	rowError,
	rowsFromQuote,
	toLineInputs,
} from "@/components/pages/rfq/quote-calc";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReasonDialog } from "@/components/shared/ReasonDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	rfqErrorMessage,
	useCancelQuoteMutation,
	useCreateQuoteMutation,
	useQuoteQuery,
	useRfqQuery,
	useSubmitQuoteMutation,
	useUpdateQuoteMutation,
} from "@/lib/api/rfq/queries";
import { istTodayIso } from "@/lib/ist-date";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { QuoteBody } from "@/types/rfq";

/** Quote entry: new, edit a draft, or read-only view of a submitted / cancelled quote (BR-RFQ-14..19). */
export function QuoteFormView({
	rfqId,
	quoteId,
	supplierId: supplierFromUrl,
}: {
	rfqId: number;
	quoteId?: number;
	supplierId?: number;
}) {
	const router = useRouter();
	const canView = useCan("rfq.view");
	const canManage = useCan("rfq.manage");
	const canAward = useCan("rfq.award");
	const rfqQuery = useRfqQuery(canView ? rfqId : undefined);
	const quoteQuery = useQuoteQuery(canView ? quoteId : undefined);
	const rfq = rfqQuery.data?.data;
	const saved = quoteQuery.data?.data;
	useBreadcrumbLast(rfq?.rfq.rfqNumber);

	const create = useCreateQuoteMutation(rfqId);
	const update = useUpdateQuoteMutation(quoteId ?? 0);
	const submit = useSubmitQuoteMutation();
	const cancelQuote = useCancelQuoteMutation();

	const [supplierId, setSupplierId] = useState<number | undefined>(
		supplierFromUrl,
	);
	const [ref, setRef] = useState("");
	const [quoteDate, setQuoteDate] = useState(istTodayIso());
	const [validTill, setValidTill] = useState("");
	const [terms, setTerms] = useState("");
	const [rows, setRows] = useState<QuoteRow[]>([]);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmSubmit, setConfirmSubmit] = useState(false);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [savedId, setSavedId] = useState<number | undefined>(quoteId);
	const seeded = useRef(false);

	// New: one empty row per open RFQ line. Existing: load the saved quote once.
	useEffect(() => {
		if (seeded.current) return;
		if (quoteId === undefined && rfq) {
			seeded.current = true;
			setRows(emptyRows(rfq.lines));
		} else if (quoteId !== undefined && saved) {
			seeded.current = true;
			setSupplierId(saved.supplierId);
			setRef(saved.supplierQuoteRef ?? "");
			setQuoteDate(saved.quoteDate ?? istTodayIso());
			setValidTill(saved.validTill ?? "");
			setTerms(
				saved.paymentTermsDays != null ? String(saved.paymentTermsDays) : "",
			);
			setRows(rowsFromQuote(saved.lines));
		}
	}, [rfq, saved, quoteId]);

	if (!canView) {
		return <NoAccessState what="quotes" />;
	}
	const loading =
		rfqQuery.isLoading || (quoteId !== undefined && quoteQuery.isLoading);
	if (loading) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Quote" />
				<Skeleton className="h-32" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (
		rfqQuery.isError ||
		!rfq ||
		(quoteId !== undefined && (quoteQuery.isError || !saved))
	) {
		const failure = rfqQuery.error ?? quoteQuery.error;
		const notFound =
			failure instanceof ApiClientError && failure.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Quote" />
				{notFound ? (
					<EmptyState title="Quote not found" />
				) : (
					<ErrorState
						message={rfqErrorMessage(failure, "The quote could not be loaded.")}
						onRetry={() => {
							void rfqQuery.refetch();
							void quoteQuery.refetch();
						}}
						retrying={rfqQuery.isRefetching}
					/>
				)}
			</div>
		);
	}

	const today = istTodayIso();
	const rfqOpen =
		rfq.rfq.status === "sent" || rfq.rfq.status === "partially_awarded";
	const isDraftQuote = quoteId === undefined || saved?.status === "draft";
	const editable = canManage && isDraftQuote && rfqOpen;
	const late = today > rfq.rfq.dueDate;
	const liveSupplierIds = new Set(
		rfq.quotes.filter((q) => q.status !== "cancelled").map((q) => q.supplierId),
	);
	const pickable = rfq.suppliers.filter(
		(s) => s.isActive && !liveSupplierIds.has(s.supplierId),
	);
	const supplierName =
		saved?.supplierName ??
		rfq.suppliers.find((s) => s.supplierId === supplierId)?.name ??
		"";
	const existing = rfq.quotes.find(
		(q) => q.supplierId === supplierId && q.status !== "cancelled",
	);

	const refError =
		submitted && ref.trim().length < 1
			? "Enter the supplier's quote reference."
			: null;
	const dateError =
		submitted && (quoteDate === "" || quoteDate > today)
			? "Quote date cannot be in the future."
			: null;
	const validError =
		submitted && (validTill === "" || validTill < quoteDate)
			? "Valid till is required and not before the quote date."
			: null;
	const termsError =
		terms !== "" &&
		!(
			Number.isInteger(Number(terms)) &&
			Number(terms) >= 0 &&
			Number(terms) <= 365
		)
			? "Payment terms: 0 to 365 days."
			: null;
	const supplierError =
		submitted && quoteId === undefined && supplierId === undefined
			? "Pick the supplier."
			: null;
	const pending = create.isPending || update.isPending || submit.isPending;

	function valid() {
		if (quoteId === undefined && supplierId === undefined) return false;
		if (ref.trim().length < 1 || ref.trim().length > 100) return false;
		if (quoteDate === "" || quoteDate > today) return false;
		if (validTill === "" || validTill < quoteDate) return false;
		if (termsError) return false;
		return rows.every((row) => rowError(row) === null);
	}

	function body(): QuoteBody {
		return {
			supplierQuoteRef: ref.trim(),
			quoteDate,
			validTill,
			paymentTermsDays: terms === "" ? undefined : Number(terms),
			lines: toLineInputs(rows),
		};
	}

	/** Save the draft and resolve with the saved quote id (new or existing). */
	async function persist(): Promise<number> {
		if (savedId !== undefined) {
			await update.mutateAsync(body());
			return savedId;
		}
		const result = await create.mutateAsync({
			supplierId: supplierId as number,
			...body(),
		});
		setSavedId(result.data.id);
		return result.data.id;
	}

	async function onSave(thenSubmit: boolean) {
		setSubmitted(true);
		setError(null);
		if (!valid()) {
			setConfirmSubmit(false);
			return;
		}
		try {
			const id = await persist();
			if (thenSubmit) {
				await submit.mutateAsync(id);
				router.push(`/rfq/${rfqId}`);
				return;
			}
			router.push(`/rfq/${rfqId}`);
		} catch (err) {
			setConfirmSubmit(false);
			setError(rfqErrorMessage(err, "The quote could not be saved."));
		}
	}

	const canCancelSubmitted =
		canManage &&
		saved?.status === "submitted" &&
		!saved.isAwarded &&
		(!rfqOpen || canAward);

	return (
		<form
			className="flex w-full max-w-6xl flex-col gap-4"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				void onSave(false);
			}}
		>
			<PageHeader
				title={`Quote · ${rfq.rfq.rfqNumber}`}
				description={
					editable
						? "Type what the supplier quoted on the phone or on paper."
						: undefined
				}
				actions={
					canCancelSubmitted ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" size="sm" variant="outline">
									<IconDots />
									More
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => setConfirmCancel(true)}
								>
									Cancel quote
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : undefined
				}
			/>
			{saved ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="font-mono">{saved.quoteNumber}</span>
					<StatusBadge
						doc="quote"
						status={saved.isAwarded ? "awarded" : saved.status}
					/>
					{saved.isLate ? <StatusBadge doc="rfqFlag" status="late" /> : null}
					{saved.status === "cancelled" ? (
						<span className="text-muted-foreground">
							Cancelled by {saved.cancelledByName ?? "–"}:{" "}
							{saved.cancelReason ?? ""}
						</span>
					) : null}
				</div>
			) : null}
			{late && editable ? (
				<output className="block rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
					Late: the quote due date has passed. You can still enter it.
				</output>
			) : null}

			<Card>
				<CardContent className="grid gap-4 pt-4 md:grid-cols-2 lg:grid-cols-3">
					<div className="min-h-19 space-y-1">
						<Label htmlFor="quote-supplier">Supplier *</Label>
						{quoteId === undefined && supplierFromUrl === undefined ? (
							<Select
								value={supplierId ? String(supplierId) : undefined}
								onValueChange={(value) => setSupplierId(Number(value))}
							>
								<SelectTrigger id="quote-supplier" className="w-full">
									<SelectValue placeholder="Select supplier" />
								</SelectTrigger>
								<SelectContent>
									{pickable.map((s) => (
										<SelectItem key={s.supplierId} value={String(s.supplierId)}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Input id="quote-supplier" value={supplierName} readOnly />
						)}
						{supplierError ? (
							<p className="text-[13px] text-destructive">{supplierError}</p>
						) : null}
						{quoteId === undefined && existing ? (
							<p role="alert" className="text-[13px] text-destructive">
								A quote from {supplierName} is already live.{" "}
								<Link
									href={`/rfq/${rfqId}/quotes/${existing.id}`}
									className="underline"
								>
									Cancel it first
								</Link>
								.
							</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="quote-ref">Quote ref *</Label>
						<Input
							id="quote-ref"
							value={ref}
							maxLength={100}
							readOnly={!editable}
							aria-invalid={refError ? true : undefined}
							onChange={(event) => setRef(event.target.value)}
						/>
						{refError ? (
							<p className="text-[13px] text-destructive">{refError}</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="quote-date">Quote date *</Label>
						<Input
							id="quote-date"
							type="date"
							max={today}
							value={quoteDate}
							readOnly={!editable}
							aria-invalid={dateError ? true : undefined}
							onChange={(event) => setQuoteDate(event.target.value)}
						/>
						{dateError ? (
							<p className="text-[13px] text-destructive">{dateError}</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="quote-valid">Valid till *</Label>
						<Input
							id="quote-valid"
							type="date"
							min={quoteDate}
							value={validTill}
							readOnly={!editable}
							aria-invalid={validError ? true : undefined}
							onChange={(event) => setValidTill(event.target.value)}
						/>
						{validError ? (
							<p className="text-[13px] text-destructive">{validError}</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="quote-terms">Payment terms (days)</Label>
						<Input
							id="quote-terms"
							inputMode="numeric"
							placeholder="Supplier default"
							className="tabular-nums"
							value={terms}
							readOnly={!editable}
							aria-invalid={termsError ? true : undefined}
							onChange={(event) => setTerms(event.target.value)}
						/>
						{termsError ? (
							<p className="text-[13px] text-destructive">{termsError}</p>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent>
					<QuoteLinesTable
						rows={rows}
						readOnly={!editable}
						showErrors={submitted}
						onChange={(rfqItemId, patch) =>
							setRows((current) =>
								current.map((row) =>
									row.rfqItemId === rfqItemId ? { ...row, ...patch } : row,
								),
							)
						}
					/>
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
					<Link href={`/rfq/${rfqId}`}>
						{editable ? "Cancel" : "Back to RFQ"}
					</Link>
				</Button>
				{editable ? (
					<>
						<Button type="submit" variant="outline" disabled={pending}>
							{pending ? "Saving…" : "Save draft"}
						</Button>
						<Button
							type="button"
							disabled={pending}
							onClick={() => {
								setSubmitted(true);
								if (valid()) setConfirmSubmit(true);
							}}
						>
							Submit quote
						</Button>
					</>
				) : null}
			</div>

			<ReasonDialog
				open={confirmSubmit}
				onOpenChange={setConfirmSubmit}
				title="Submit this quote?"
				description="A submitted quote can't be edited. A change means cancel and enter a new one."
				keepLabel="Keep draft"
				actionLabel="Submit quote"
				pendingLabel="Submitting…"
				destructive={false}
				withReason={false}
				pending={pending}
				error={error}
				onConfirm={() => void onSave(true)}
			/>
			<ReasonDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title={`Cancel quote ${saved?.quoteNumber ?? ""}?`}
				description={`The quote from ${supplierName} is no longer compared.`}
				actionLabel="Cancel quote"
				pendingLabel="Cancelling…"
				pending={cancelQuote.isPending}
				error={dialogError}
				onConfirm={(reason) => {
					if (!saved) return;
					setDialogError(null);
					cancelQuote.mutate(
						{ quoteId: saved.id, reason },
						{
							onSuccess: () => router.push(`/rfq/${rfqId}`),
							onError: (err) =>
								setDialogError(
									rfqErrorMessage(err, "Could not cancel the quote."),
								),
						},
					);
				}}
			/>
		</form>
	);
}
