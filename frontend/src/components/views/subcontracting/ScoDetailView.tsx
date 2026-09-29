"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { ApprovalHistoryPanel } from "@/components/pages/approval/ApprovalHistoryPanel";
import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { CancelScoAlert } from "@/components/pages/subcontracting/CancelScoAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
	useScoDetailQuery,
	useSubmitScoMutation,
} from "@/lib/api/subcontracting/queries";
import {
	formatScoDate,
	getScoStatusBadgeStyle,
	SCO_STATUS_LABEL,
} from "@/lib/sco-format";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type { ScoStatus } from "@/types/subcontracting";

// Cancel is allowed only before anything is issued (BR-SCO-20).
const CANCELLABLE: ReadonlySet<ScoStatus> = new Set([
	"draft",
	"pending_approval",
	"approved",
]);

export function ScoDetailView({ scoId }: { scoId: number }) {
	const canManage = useCan("sco.manage");
	const userId = useAuthSessionStore((state) => state.userId);
	const query = useScoDetailQuery(scoId);
	const submitMutation = useSubmitScoMutation();
	const [showHistory, setShowHistory] = useState(false);

	const back = (
		<Button type="button" variant="ghost" size="sm" className="w-fit" asChild>
			<Link href="/subcontracting">
				<IconArrowLeft className="size-3.5" />
				Back to orders
			</Link>
		</Button>
	);

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4 p-6">
				{back}
				<Skeleton className="h-40" />
				<Skeleton className="h-48" />
			</div>
		);
	}

	const result = query.data;
	if (!result?.success) {
		return (
			<div className="flex flex-col gap-4 p-6">
				{back}
				<p className="text-sm text-muted-foreground">
					{result?.message ?? "Order not found."}
				</p>
			</div>
		);
	}

	const { sco, items } = result.data;
	const badgeStyle = getScoStatusBadgeStyle(sco.status);
	const isDraft = sco.status === "draft";
	// Only the creator submits (BR-SCO-06); the server enforces it too.
	const isCreator = userId !== null && String(sco.createdBy) === userId;

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			{back}

			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<h1 className="font-heading text-lg font-medium">
							{sco.scoNumber}
						</h1>
						<Badge
							variant={badgeStyle.variant}
							className={badgeStyle.className}
						>
							{SCO_STATUS_LABEL[sco.status]}
						</Badge>
					</div>
					<p className="text-xs text-muted-foreground">{sco.vendorName}</p>
				</div>
				{canManage ? (
					<div className="flex flex-wrap gap-2">
						{isDraft ? (
							<>
								<Button type="button" size="sm" variant="outline" asChild>
									<Link href={`/subcontracting/${sco.id}/edit`}>Edit</Link>
								</Button>
								{isCreator ? (
									<Button
										type="button"
										size="sm"
										disabled={submitMutation.isPending}
										onClick={() => submitMutation.mutate(sco.id)}
									>
										{submitMutation.isPending
											? "Submitting..."
											: "Submit for approval"}
									</Button>
								) : null}
							</>
						) : null}
						{CANCELLABLE.has(sco.status) ? (
							<CancelScoAlert scoId={sco.id} scoNumber={sco.scoNumber} />
						) : null}
					</div>
				) : null}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Summary</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
					<Field
						label="Expected return"
						value={formatScoDate(sco.expectedReturnDate)}
					/>
					<Field label="Project ref" value={sco.projectRef ?? "-"} />
					<Field label="Created" value={formatScoDate(sco.createdAt)} />
					<Field
						label="Approval"
						value={
							sco.status === "pending_approval"
								? `Level ${sco.currentApprovalLevel} of ${sco.totalApprovalLevels}`
								: SCO_STATUS_LABEL[sco.status]
						}
					/>
					<Field
						label="Value (ex GST)"
						value={formatPaise(sco.subtotalPaise)}
					/>
					<Field label="GST" value={formatPaise(sco.taxAmountPaise)} />
					<Field
						label="Total incl. GST"
						value={formatPaise(sco.totalAmountPaise)}
					/>
					<Field label="Notes" value={sco.notes ?? "-"} />
					{sco.status === "cancelled" ? (
						<>
							<Field label="Cancelled by" value={sco.cancelledByName ?? "-"} />
							<Field label="Cancel reason" value={sco.cancelReason ?? "-"} />
						</>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Raw item</TableHead>
								<TableHead>Finished item</TableHead>
								<TableHead>Service</TableHead>
								<TableHead className="text-right">Send</TableHead>
								<TableHead className="text-right">Return</TableHead>
								<TableHead className="text-right">Price</TableHead>
								<TableHead className="text-right">GST</TableHead>
								<TableHead className="text-right">Value</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((line) => (
								<TableRow key={line.id}>
									<TableCell>
										{line.rawItemSku} · {line.rawItemName}
										{line.rawItemBatch ? (
											<span className="block text-[11px] text-muted-foreground">
												Batch {line.rawItemBatch}
											</span>
										) : null}
									</TableCell>
									<TableCell>
										{line.finishedItemSku} · {line.finishedItemName}
									</TableCell>
									<TableCell>{line.serviceDescription}</TableCell>
									<TableCell className="text-right">
										{line.rawQtyToIssue}
									</TableCell>
									<TableCell className="text-right">
										{line.expectedReturnQty}
									</TableCell>
									<TableCell className="text-right">
										{formatPaise(line.serviceUnitPricePaise)}
									</TableCell>
									<TableCell className="text-right">
										{line.serviceTaxPercentage}% (
										{formatPaise(line.lineTaxPaise)})
									</TableCell>
									<TableCell className="text-right">
										{formatPaise(line.lineValuePaise)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<div className="space-y-2">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => setShowHistory((value) => !value)}
				>
					{showHistory ? "Hide approval history" : "Approval history"}
				</Button>
				{showHistory ? (
					<ApprovalHistoryPanel docType="sco" docId={sco.id} />
				) : null}
			</div>
		</div>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-muted-foreground">{label}</p>
			<p className="font-medium">{value}</p>
		</div>
	);
}
