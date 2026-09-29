"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditGrnModal } from "@/components/pages/grn/EditGrnModal";
import { GrnLinesTable } from "@/components/pages/grn/GrnLinesTable";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useDeleteGrnMutation, useGrnDetailQuery } from "@/lib/api/grn/queries";
import { getGrnStatusBadgeStyle } from "@/lib/grn-status-badge";
import { humanizeStatusLabel } from "@/lib/pr-status-badge";
import type { Grn } from "@/types/grn";

function formatDate(value?: string | null) {
	if (!value) return "-";
	return new Date(value).toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function GrnDetailView({ grnId }: { grnId: number }) {
	const router = useRouter();
	const canEditDraft = useCan("grn.edit_draft");
	const [editOpen, setEditOpen] = useState(false);

	const detailQuery = useGrnDetailQuery(grnId, grnId > 0);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const grn = detail?.grn;
	const items = detail?.items ?? [];

	const canManage = canEditDraft && grn?.status === "draft";

	return (
		<div className="flex w-full flex-col gap-4 p-6">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="w-fit"
				onClick={() => router.push("/grn")}
			>
				<IconArrowLeft className="size-3.5" />
				Back to GRN tracking
			</Button>

			{detailQuery.isLoading ? (
				<DetailSkeleton />
			) : !detail || !grn ? (
				<Card>
					<CardContent className="py-10 text-center text-muted-foreground">
						GRN not found.
					</CardContent>
				</Card>
			) : (
				<div className="flex min-w-0 flex-col gap-4">
					<DetailHeader
						grn={grn}
						canManage={canManage}
						onEdit={() => setEditOpen(true)}
					/>

					<Card>
						<CardHeader>
							<CardTitle>Lines</CardTitle>
						</CardHeader>
						<CardContent>
							<GrnLinesTable
								grnId={grn.id}
								poId={grn.poId ?? 0}
								items={items}
							/>
						</CardContent>
					</Card>
				</div>
			)}

			{editOpen && grn ? (
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

function DetailHeader({
	grn,
	canManage,
	onEdit,
}: {
	grn: Grn;
	canManage: boolean;
	onEdit: () => void;
}) {
	const badgeStyle = getGrnStatusBadgeStyle(grn.status);
	const deleteMutation = useDeleteGrnMutation();
	const router = useRouter();

	return (
		<div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
			<div>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="font-heading text-xl font-medium">{grn.grnNumber}</h2>
					<Badge variant={badgeStyle.variant} className={badgeStyle.className}>
						{humanizeStatusLabel(grn.status)}
					</Badge>
				</div>
				<p className="text-xs text-muted-foreground">
					{grn.poId != null ? `PO #${grn.poId}` : "No linked PO"} · Received{" "}
					{formatDate(grn.receivedDate)}
				</p>
			</div>

			<div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
				<span>Challan {grn.challanNo ?? "-"}</span>
				<span>Vehicle {grn.vehicleNo ?? "-"}</span>
				<span>Driver {grn.driverName ?? "-"}</span>
				{grn.driverPhone ? <span>Phone {grn.driverPhone}</span> : null}
				{grn.remarks ? <span>Remarks {grn.remarks}</span> : null}
			</div>

			{canManage ? (
				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="outline" onClick={onEdit}>
						Edit
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button type="button" size="sm" variant="outline">
								Delete
							</Button>
						</AlertDialogTrigger>
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
				</div>
			) : null}
		</div>
	);
}

function DetailSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-96 w-full" />
		</div>
	);
}
