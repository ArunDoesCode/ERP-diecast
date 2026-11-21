"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { DetailHeader } from "@/components/shared/DetailHeader";
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
import { ApiClientError } from "@/lib/api/client";
import {
	contractErrorMessage,
	overlapContractNumber,
	useActivateContractMutation,
	useCancelContractMutation,
	useContractQuery,
	useTerminateContractMutation,
} from "@/lib/api/rate-contract/queries";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatQty,
} from "@/lib/format";
import { istTodayIso } from "@/lib/ist-date";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";

type Dialog = "activate" | "terminate" | "cancel";

export function RateContractDetailView({ contractId }: { contractId: number }) {
	const canView = useCan("contract.view");
	const canManage = useCan("contract.manage");
	const query = useContractQuery(canView ? contractId : undefined);
	const contract = query.data?.data;
	useBreadcrumbLast(contract?.contractNumber);

	const activate = useActivateContractMutation(contractId);
	const terminate = useTerminateContractMutation(contractId);
	const cancel = useCancelContractMutation(contractId);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [clash, setClash] = useState<string | null>(null);
	const [terminatedOn, setTerminatedOn] = useState(istTodayIso());

	const back = { backHref: "/rate-contracts", backLabel: "rate contracts" };

	if (!canView) {
		return <NoAccessState what="rate contracts" />;
	}
	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
					<Skeleton className="h-64" />
					<Skeleton className="h-64" />
				</div>
			</div>
		);
	}
	if (query.isError || !contract) {
		const notFound =
			query.error instanceof ApiClientError && query.error.status === 404;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader
					title="Contract not found"
					actions={
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href={back.backHref}>Back to rate contracts</Link>
						</Button>
					}
				/>
				{notFound ? (
					<EmptyState title="It may have been deleted, or the link is wrong" />
				) : (
					<ErrorState
						message={contractErrorMessage(
							query.error,
							"The contract could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				)}
			</div>
		);
	}

	const isDraft = contract.status === "draft";
	const isActive =
		contract.status === "active" && contract.effectiveStatus === "active";
	const showMore = canManage && (isDraft || isActive);
	const today = istTodayIso();

	function close() {
		setDialog(null);
		setError(null);
		setClash(null);
	}
	const fail = (fallback: string) => (err: unknown) => {
		setClash(overlapContractNumber(err));
		setError(contractErrorMessage(err, fallback));
	};

	const actions = (
		<>
			{isDraft && canManage ? (
				<Button type="button" size="sm" onClick={() => setDialog("activate")}>
					Activate
				</Button>
			) : null}
			{showMore ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm" variant="outline">
							<IconDots />
							More
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{isDraft ? (
							<DropdownMenuItem asChild>
								<Link href={`/rate-contracts/${contract.id}/edit`}>Edit</Link>
							</DropdownMenuItem>
						) : null}
						{isDraft ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("cancel")}
							>
								Cancel contract
							</DropdownMenuItem>
						) : null}
						{isActive ? (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("terminate")}
							>
								Terminate
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</>
	);

	const clashLink = clash ? (
		<p className="text-sm">
			Clashes with{" "}
			<Link
				href={`/rate-contracts?q=${encodeURIComponent(clash)}`}
				className="font-mono text-brand-accent underline"
			>
				{clash}
			</Link>
			.
		</p>
	) : null;

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			<DetailHeader
				docNo={contract.contractNumber}
				status={
					<StatusBadge doc="contract" status={contract.effectiveStatus} />
				}
				meta={[
					{ label: "Supplier", value: contract.supplierName },
					{
						label: "Valid",
						value: `${formatDate(contract.validFrom)} to ${formatDate(contract.validTo)}`,
					},
					{ label: "Allowance", value: `${contract.allowancePercent}%` },
					...(contract.notes
						? [{ label: "Notes", value: contract.notes }]
						: []),
				]}
				actions={actions}
				{...back}
			/>
			{contract.status === "terminated" || contract.status === "cancelled" ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					{contract.status === "terminated" ? "Terminated" : "Cancelled"}
					{contract.terminateReason || contract.cancelReason
						? `: ${contract.terminateReason ?? contract.cancelReason}`
						: ""}
				</output>
			) : null}

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="flex min-w-0 flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Items ({contract.lines.length})</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Item · rate · GST</TableHead>
										<TableHead className="text-right">Agreed</TableHead>
										<TableHead className="text-right">Ordered (%)</TableHead>
										<TableHead className="text-right">Received</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{contract.lines.map((line) => (
										<TableRow key={line.id}>
											<TableCell className="whitespace-normal">
												{line.itemCode} · {line.itemName}
												<span className="block text-[13px] text-muted-foreground tabular-nums">
													{formatMoney(line.ratePaise)} / {line.uom} · GST{" "}
													{line.gstPercent}%
												</span>
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{line.agreedQty === null
													? "Rate only"
													: formatQty(line.agreedQty, line.uom, 3)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{formatQty(line.orderedQty, line.uom, 3)}
												<span className="block text-[13px] text-muted-foreground">
													{line.percentOrdered === null
														? "–"
														: `${line.percentOrdered} %`}
												</span>
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{formatQty(line.receivedQty, line.uom, 3)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Purchase orders</CardTitle>
						</CardHeader>
						<CardContent>
							{contract.pos.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No purchase order has used this contract yet.
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>PO no.</TableHead>
											<TableHead>Status</TableHead>
											<TableHead className="text-right">Lines</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{contract.pos.map((po) => (
											<TableRow key={po.poId}>
												<TableCell>
													{po.prId ? (
														<Link
															href={`/purchase-orders/${po.prId}`}
															className="font-mono text-brand-accent hover:underline"
														>
															{po.poNumber}
														</Link>
													) : (
														<span className="font-mono">{po.poNumber}</span>
													)}
												</TableCell>
												<TableCell>
													<StatusBadge doc="po" status={po.status} />
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{po.lineCount}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Next step</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-sm">
							{isDraft ? (
								canManage ? (
									<Button type="button" onClick={() => setDialog("activate")}>
										Activate
									</Button>
								) : (
									<p className="text-muted-foreground">Waiting for purchase</p>
								)
							) : (
								<p className="text-muted-foreground">Nothing more to do.</p>
							)}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Audit</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="space-y-1.5 text-sm">
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">Created</dt>
									<dd className="text-right">
										{contract.createdByName ?? "–"},{" "}
										{formatDateTime(contract.createdAt)}
									</dd>
								</div>
								{contract.activatedAt ? (
									<div className="flex justify-between gap-3">
										<dt className="text-muted-foreground">Activated</dt>
										<dd className="text-right">
											{contract.activatedByName ?? "–"},{" "}
											{formatDateTime(contract.activatedAt)}
										</dd>
									</div>
								) : null}
								{contract.terminatedAt ? (
									<div className="flex justify-between gap-3">
										<dt className="text-muted-foreground">Terminated</dt>
										<dd className="text-right">
											{contract.terminatedByName ?? "–"},{" "}
											{formatDateTime(contract.terminatedAt)}
											{contract.terminatedOn
												? ` (on ${formatDate(contract.terminatedOn)})`
												: ""}
										</dd>
									</div>
								) : null}
								{contract.cancelledAt ? (
									<div className="flex justify-between gap-3">
										<dt className="text-muted-foreground">Cancelled</dt>
										<dd className="text-right">
											{contract.cancelledByName ?? "–"},{" "}
											{formatDateTime(contract.cancelledAt)}
										</dd>
									</div>
								) : null}
							</dl>
						</CardContent>
					</Card>
				</div>
			</div>

			<ReasonDialog
				open={dialog === "activate"}
				onOpenChange={(open) => !open && close()}
				title={`Activate ${contract.contractNumber}?`}
				description="From now on, POs for these items from this supplier use the contract rate during its dates."
				keepLabel="Keep draft"
				actionLabel="Activate"
				pendingLabel="Activating…"
				destructive={false}
				withReason={false}
				pending={activate.isPending}
				error={dialog === "activate" ? error : null}
				onConfirm={() => {
					setError(null);
					setClash(null);
					activate.mutate(undefined, {
						onSuccess: close,
						onError: fail("Could not activate the contract."),
					});
				}}
			>
				{dialog === "activate" ? clashLink : null}
			</ReasonDialog>
			<ReasonDialog
				open={dialog === "terminate"}
				onOpenChange={(open) => !open && close()}
				title={`Terminate ${contract.contractNumber}?`}
				description="The contract stops on the date below. POs already made keep their rate."
				keepLabel="Keep active"
				actionLabel="Terminate"
				pendingLabel="Terminating…"
				pending={terminate.isPending}
				error={dialog === "terminate" ? error : null}
				onConfirm={(reason) => {
					setError(null);
					terminate.mutate(
						{ reason, terminatedOn },
						{
							onSuccess: close,
							onError: fail("Could not terminate the contract."),
						},
					);
				}}
			>
				<div className="min-h-19 space-y-1">
					<Label htmlFor="rc-terminate-on">Terminate on *</Label>
					<Input
						id="rc-terminate-on"
						type="date"
						min={today}
						max={contract.validTo}
						value={terminatedOn}
						onChange={(event) => setTerminatedOn(event.target.value)}
					/>
				</div>
			</ReasonDialog>
			<ReasonDialog
				open={dialog === "cancel"}
				onOpenChange={(open) => !open && close()}
				title={`Cancel ${contract.contractNumber}?`}
				description="The draft is cancelled. The number cannot be reused."
				keepLabel="Keep draft"
				actionLabel="Cancel contract"
				pendingLabel="Cancelling…"
				pending={cancel.isPending}
				error={dialog === "cancel" ? error : null}
				onConfirm={(reason) => {
					setError(null);
					cancel.mutate(
						{ reason },
						{
							onSuccess: close,
							onError: fail("Could not cancel the contract."),
						},
					);
				}}
			/>
		</div>
	);
}
