"use client";

import { IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ContractItemPicker } from "@/components/pages/rate-contracts/ContractItemPicker";
import { SupplierPicker } from "@/components/pages/rfq/SupplierPicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { ApiClientError } from "@/lib/api/client";
import {
	contractErrorMessage,
	useContractQuery,
	useCreateContractMutation,
	useUpdateContractMutation,
} from "@/lib/api/rate-contract/queries";
import { MAX_MONEY_PAISE } from "@/lib/money";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import {
	CONTRACT_ALLOWANCE_MAX,
	CONTRACT_GST_PERCENTS,
	CONTRACT_NOTES_MAX,
} from "@/types/rate-contract";

type FormLine = {
	key: number;
	itemId?: number;
	itemLabel?: string;
	uom: string;
	rate: string;
	gst: string;
	qty: string;
};

let lineKey = 0;
function blankLine(): FormLine {
	lineKey += 1;
	return { key: lineKey, uom: "", rate: "", gst: "", qty: "" };
}

function rupeesToPaise(text: string): number | null {
	const t = text.trim();
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	return Math.round(Number(t) * 100);
}

function lineError(line: FormLine): string | null {
	if (line.itemId === undefined) return "Pick the item.";
	const rate = rupeesToPaise(line.rate);
	if (rate === null || rate < 1)
		return "Enter the rate in rupees (up to 2 decimals).";
	if (rate > MAX_MONEY_PAISE) return "Rate is too large.";
	if (line.gst === "") return "Pick the GST %.";
	if (line.qty.trim() !== "") {
		if (!/^\d+(\.\d{1,3})?$/.test(line.qty.trim()) || Number(line.qty) <= 0)
			return "Agreed qty: more than 0, up to 3 decimals, or leave blank.";
	}
	return null;
}

/** New rate contract or edit of a draft (BR-RFQ-40, 41). An active contract has no edit. */
export function RateContractFormView({ contractId }: { contractId?: number }) {
	const router = useRouter();
	const canManage = useCan("contract.manage");
	const isEdit = contractId !== undefined;
	const details = useContractQuery(
		canManage && isEdit ? contractId : undefined,
	);
	const create = useCreateContractMutation();
	const update = useUpdateContractMutation();
	const contract = details.data?.data;
	useBreadcrumbLast(contract?.contractNumber);

	const [supplier, setSupplier] = useState<{ id: number; name: string } | null>(
		null,
	);
	const [validFrom, setValidFrom] = useState("");
	const [validTo, setValidTo] = useState("");
	const [allowance, setAllowance] = useState("0");
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState<FormLine[]>(() => [blankLine()]);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const seeded = useRef(false);

	// Only a draft has an edit screen; others go to the detail.
	const lockedId =
		contract && contract.status !== "draft" ? contract.id : undefined;
	useEffect(() => {
		if (lockedId !== undefined) router.replace(`/rate-contracts/${lockedId}`);
	}, [lockedId, router]);

	useEffect(() => {
		if (!contract || seeded.current) return;
		seeded.current = true;
		setSupplier({ id: contract.supplierId, name: contract.supplierName });
		setValidFrom(contract.validFrom);
		setValidTo(contract.validTo);
		setAllowance(String(contract.allowancePercent));
		setNotes(contract.notes ?? "");
		setLines(
			contract.lines.map((line) => {
				lineKey += 1;
				return {
					key: lineKey,
					itemId: line.itemId,
					itemLabel: `${line.itemCode} · ${line.itemName}`,
					uom: line.uom,
					rate: String(line.ratePaise / 100),
					gst: String(line.gstPercent),
					qty: line.agreedQty != null ? String(line.agreedQty) : "",
				};
			}),
		);
	}, [contract]);

	if (!canManage) {
		return <NoAccessState what="rate contract entry" />;
	}
	if (isEdit && details.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Edit rate contract" />
				<Skeleton className="h-40" />
				<Skeleton className="h-40" />
			</div>
		);
	}
	if (isEdit && (details.isError || !contract)) {
		const notFound =
			details.error instanceof ApiClientError && details.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title="Edit rate contract" />
				{notFound ? (
					<EmptyState title="Contract not found" />
				) : (
					<ErrorState
						message={contractErrorMessage(
							details.error,
							"The contract could not be loaded.",
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
	if (contract && contract.status !== "draft") {
		return <Skeleton className="h-40" />;
	}

	const allowanceNum = Number(allowance);
	const allowanceError =
		allowance.trim() === "" ||
		!Number.isFinite(allowanceNum) ||
		allowanceNum < 0 ||
		allowanceNum > CONTRACT_ALLOWANCE_MAX ||
		!/^\d+(\.\d{1,2})?$/.test(allowance.trim())
			? `Allowance: 0 to ${CONTRACT_ALLOWANCE_MAX}, up to 2 decimals.`
			: null;
	const supplierError = submitted && !supplier ? "Pick the supplier." : null;
	const fromError =
		submitted && validFrom === "" ? "Valid from is required." : null;
	const toError =
		submitted && (validTo === "" || (validFrom !== "" && validTo < validFrom))
			? "Valid to is required and not before valid from."
			: null;
	const pending = create.isPending || update.isPending;

	function patchLine(key: number, patch: Partial<FormLine>) {
		setLines((current) =>
			current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
		);
	}

	function save() {
		setSubmitted(true);
		setError(null);
		const ok =
			supplier &&
			validFrom !== "" &&
			validTo !== "" &&
			validTo >= validFrom &&
			!allowanceError &&
			lines.length > 0 &&
			lines.every((line) => lineError(line) === null);
		if (!ok || !supplier) return;
		const body = {
			supplierId: supplier.id,
			validFrom,
			validTo,
			allowancePercent: allowanceNum,
			notes: notes.trim() || undefined,
			lines: lines.map((line) => ({
				itemId: line.itemId as number,
				ratePaise: rupeesToPaise(line.rate) as number,
				gstPercent: Number(line.gst),
				agreedQty: line.qty.trim() === "" ? null : Number(line.qty),
			})),
		};
		const onError = (err: unknown) =>
			setError(contractErrorMessage(err, "The contract could not be saved."));
		if (contractId !== undefined) {
			update.mutate(
				{ id: contractId, ...body },
				{
					onSuccess: () => router.push(`/rate-contracts/${contractId}`),
					onError,
				},
			);
		} else {
			create.mutate(body, {
				onSuccess: (result) => router.push(`/rate-contracts/${result.data.id}`),
				onError,
			});
		}
	}

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
				title={
					isEdit
						? `Edit ${contract?.contractNumber ?? "rate contract"}`
						: "New rate contract"
				}
				description="A price agreed with one supplier for a period."
			/>

			<Card>
				<CardContent className="grid gap-4 pt-4 md:grid-cols-2">
					<div className="min-h-19 space-y-1">
						<Label htmlFor="rc-supplier">Supplier *</Label>
						<SupplierPicker
							id="rc-supplier"
							value={supplier?.id}
							valueLabel={supplier?.name}
							onChange={(picked) =>
								setSupplier({ id: picked.id, name: picked.name })
							}
						/>
						{supplierError ? (
							<p className="text-[13px] text-destructive">{supplierError}</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="rc-allowance">Allowance %</Label>
						<Input
							id="rc-allowance"
							inputMode="decimal"
							className="text-right tabular-nums"
							value={allowance}
							aria-invalid={allowanceError ? true : undefined}
							onChange={(event) => setAllowance(event.target.value)}
						/>
						<p
							className={
								allowanceError
									? "text-[13px] text-destructive"
									: "text-[13px] text-muted-foreground"
							}
						>
							{allowanceError ?? "Extra quantity allowed over the agreed qty."}
						</p>
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="rc-from">Valid from *</Label>
						<Input
							id="rc-from"
							type="date"
							value={validFrom}
							aria-invalid={fromError ? true : undefined}
							onChange={(event) => setValidFrom(event.target.value)}
						/>
						{fromError ? (
							<p className="text-[13px] text-destructive">{fromError}</p>
						) : null}
					</div>
					<div className="min-h-19 space-y-1">
						<Label htmlFor="rc-to">Valid to *</Label>
						<Input
							id="rc-to"
							type="date"
							min={validFrom || undefined}
							value={validTo}
							aria-invalid={toError ? true : undefined}
							onChange={(event) => setValidTo(event.target.value)}
						/>
						{toError ? (
							<p className="text-[13px] text-destructive">{toError}</p>
						) : null}
					</div>
					<p className="text-[13px] text-muted-foreground md:col-span-2">
						Rate is fixed for the whole period. For a new price, make a new
						contract.
					</p>
					<div className="min-h-19 space-y-1 md:col-span-2">
						<Label htmlFor="rc-notes">Notes</Label>
						<Textarea
							id="rc-notes"
							value={notes}
							maxLength={CONTRACT_NOTES_MAX}
							onChange={(event) => setNotes(event.target.value)}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex-row items-center justify-between gap-2">
					<CardTitle>Items ({lines.length})</CardTitle>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setLines((current) => [...current, blankLine()])}
					>
						Add item
					</Button>
				</CardHeader>
				<CardContent className="space-y-4">
					{lines.length === 0 ? (
						<p
							role={submitted ? "alert" : undefined}
							className="text-sm text-muted-foreground"
						>
							Add at least one item.
						</p>
					) : null}
					{lines.map((line, index) => {
						const error = submitted ? lineError(line) : null;
						const id = `rc-line-${line.key}`;
						return (
							<div
								key={line.key}
								className="grid items-start gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
							>
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${id}-item`}>Item {index + 1} *</Label>
									<ContractItemPicker
										id={`${id}-item`}
										value={line.itemId}
										valueLabel={line.itemLabel}
										exclude={lines
											.map((l) => l.itemId)
											.filter((v): v is number => v !== undefined)}
										onChange={(item) =>
											patchLine(line.key, {
												itemId: item.id,
												itemLabel: `${item.sku} · ${item.name}`,
												uom: item.uom,
											})
										}
									/>
								</div>
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${id}-rate`}>
										Rate ₹{line.uom ? ` per ${line.uom}` : ""} *
									</Label>
									<Input
										id={`${id}-rate`}
										inputMode="decimal"
										className="text-right tabular-nums"
										value={line.rate}
										aria-invalid={error ? true : undefined}
										onChange={(event) =>
											patchLine(line.key, { rate: event.target.value })
										}
									/>
								</div>
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${id}-gst`}>GST % *</Label>
									<Select
										value={line.gst}
										onValueChange={(value) =>
											patchLine(line.key, { gst: value })
										}
									>
										<SelectTrigger id={`${id}-gst`} className="w-full">
											<SelectValue placeholder="GST %" />
										</SelectTrigger>
										<SelectContent>
											{CONTRACT_GST_PERCENTS.map((value) => (
												<SelectItem key={value} value={String(value)}>
													{value}%
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="min-h-19 space-y-1">
									<Label htmlFor={`${id}-qty`}>
										Agreed qty{line.uom ? ` (${line.uom})` : ""}
									</Label>
									<Input
										id={`${id}-qty`}
										inputMode="decimal"
										className="text-right tabular-nums"
										placeholder="Rate only"
										value={line.qty}
										onChange={(event) =>
											patchLine(line.key, { qty: event.target.value })
										}
									/>
								</div>
								<div className="pt-6">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={`Remove item ${index + 1}`}
										onClick={() =>
											setLines((current) =>
												current.filter((l) => l.key !== line.key),
											)
										}
									>
										<IconX />
									</Button>
								</div>
								{error ? (
									<p
										role="alert"
										className="text-[13px] text-destructive md:col-span-5"
									>
										{error}
									</p>
								) : null}
							</div>
						);
					})}
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
					<Link
						href={
							contractId !== undefined
								? `/rate-contracts/${contractId}`
								: "/rate-contracts"
						}
					>
						Cancel
					</Link>
				</Button>
				<Button type="submit" disabled={pending}>
					{pending ? "Saving…" : "Save draft"}
				</Button>
			</div>
		</form>
	);
}
