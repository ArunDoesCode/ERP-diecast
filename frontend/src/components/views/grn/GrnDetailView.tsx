"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditGrnModal } from "@/components/pages/grn/EditGrnModal";
import { GrnLinesTable } from "@/components/pages/grn/GrnLinesTable";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { DocumentFlow } from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useDeleteGrnMutation, useGrnDetailQuery } from "@/lib/api/grn/queries";
import { formatDate, formatDocNo } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { Grn, GrnLinkedPo, GrnLinkedPr } from "@/types/grn";

export function GrnDetailView({ grnId }: { grnId: number }) {
	const canEditDraft = useCan("grn.edit_draft");
	const [editOpen, setEditOpen] = useState(false);

	const detailQuery = useGrnDetailQuery(grnId, grnId > 0);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const grn = detail?.grn;
	const items = detail?.items ?? [];
	useBreadcrumbLast(grn?.grnNumber);

	const canManage = canEditDraft && grn?.status === "draft";

	if (detailQuery.isLoading) {
		return (
			<div className="flex w-full flex-col gap-4">
				<DetailHeader
					docNo=""
					status={null}
					backHref="/grn"
					backLabel="goods receipts"
					loading
				/>
				<Skeleton className="h-96 w-full" />
			</div>
		);
	}

	if (!detail || !grn) {
		return (
			<EmptyState
				title="GRN not found"
				description="It may have been deleted, or the link is wrong."
				action={
					<Button type="button" variant="outline" size="sm" asChild>
						<Link href="/grn">Back to goods receipts</Link>
					</Button>
				}
			/>
		);
	}

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			<DetailHeader
				docNo={formatDocNo(grn.grnNumber)}
				status={<StatusBadge doc="grn" status={grn.status} />}
				backHref="/grn"
				backLabel="goods receipts"
				meta={[
					{
						label: "PO",
						value: detail.po ? (
							<span className="font-mono">
								{formatDocNo(detail.po.poNumber)}
							</span>
						) : (
							"No linked PO"
						),
					},
					{ label: "Received", value: formatDate(grn.receivedDate) },
					{ label: "Challan", value: grn.challanNo ?? "–" },
					{ label: "Vehicle", value: grn.vehicleNo ?? "–" },
				]}
				actions={
					canManage ? (
						<GrnDraftActions grn={grn} onEdit={() => setEditOpen(true)} />
					) : undefined
				}
			/>

			<GrnDocumentFlow grn={grn} po={detail.po} prs={detail.prs} />

			<GrnDeliveryDetails grn={grn} />

			<Card>
				<CardHeader>
					<CardTitle>Lines</CardTitle>
				</CardHeader>
				<CardContent>
					<GrnLinesTable grnId={grn.id} poId={grn.poId ?? 0} items={items} />
				</CardContent>
			</Card>

			{editOpen ? (
				<EditGrnModal
					grnId={grn.id}
					open={editOpen}
					onOpenChange={setEditOpen}
					onSaved={() => setEditOpen(false)}
				/>
			) : null}
		</div>
	);
}

/** Requisition → purchase order → goods receipt, this GRN current (BR-GRN-45). */
function GrnDocumentFlow({
	grn,
	po,
	prs,
}: {
	grn: Grn;
	po: GrnLinkedPo | null;
	prs: GrnLinkedPr[];
}) {
	const firstPr = prs[0];
	return (
		<DocumentFlow
			steps={[
				{
					label: "Requisition",
					docNo: firstPr
						? prs.length > 1
							? `${firstPr.prNumber} +${prs.length - 1}`
							: firstPr.prNumber
						: undefined,
					href: firstPr ? `/purchase-orders/${firstPr.id}` : undefined,
					status: firstPr ? (
						<StatusBadge doc="pr" status={firstPr.status} />
					) : undefined,
					state: firstPr ? "done" : "todo",
				},
				{
					label: "Purchase order",
					docNo: po?.poNumber,
					status: po ? <StatusBadge doc="po" status={po.status} /> : undefined,
					state: po ? "done" : "todo",
				},
				{
					label: "Goods receipt",
					docNo: grn.grnNumber,
					status: <StatusBadge doc="grn" status={grn.status} />,
					state: "current",
				},
			]}
		/>
	);
}

/** Driver, phone and remarks: the fields DetailHeader's four meta pairs leave out. */
function GrnDeliveryDetails({ grn }: { grn: Grn }) {
	const rows = [
		{ label: "Driver", value: grn.driverName },
		{ label: "Phone", value: grn.driverPhone },
		{ label: "Remarks", value: grn.remarks },
	].filter((row) => row.value);
	if (rows.length === 0) return null;
	return (
		<dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
			{rows.map((row) => (
				<div key={row.label} className="flex gap-1.5">
					<dt className="text-xs font-semibold text-muted-foreground">
						{row.label}
					</dt>
					<dd>{row.value}</dd>
				</div>
			))}
		</dl>
	);
}

/** Edit stays a button; Delete lives in the "More" menu behind a confirm dialog naming the GRN (BR-DS-08). */
function GrnDraftActions({ grn, onEdit }: { grn: Grn; onEdit: () => void }) {
	const deleteMutation = useDeleteGrnMutation();
	const router = useRouter();
	const [confirmOpen, setConfirmOpen] = useState(false);

	return (
		<>
			<Button type="button" size="sm" variant="outline" onClick={onEdit}>
				Edit
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="outline"
						aria-label={`More actions for ${grn.grnNumber}`}
					>
						<IconDots className="size-3.5" />
						More
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setConfirmOpen(true)}
					>
						Delete GRN
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {grn.grnNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							Only legal while draft. Cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() =>
								deleteMutation.mutate(grn.id, {
									onSuccess: (result) => {
										if (result.success) router.push("/grn");
									},
								})
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
