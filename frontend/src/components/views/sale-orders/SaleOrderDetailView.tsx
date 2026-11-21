"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	SoCustomerCard,
	SoNotesCard,
} from "@/components/pages/sale-orders/SoInfoCards";
import { SoLinesCard } from "@/components/pages/sale-orders/SoLinesCard";
import { SoReasonDialog } from "@/components/pages/sale-orders/SoReasonDialog";
import {
	SoActivityPanel,
	SoDeliveryNotesPanel,
	SoExplosionPanel,
	SoRaisedPanel,
} from "@/components/pages/sale-orders/SoSidePanels";
import { raisedDocHref } from "@/components/pages/sale-orders/so-format";
import { DetailHeader } from "@/components/shared/DetailHeader";
import {
	DocumentFlow,
	type DocumentFlowStep,
} from "@/components/shared/DocumentFlow";
import { ErrorState } from "@/components/shared/ErrorState";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useDeliveryNotesQuery } from "@/lib/api/delivery-note/queries";
import {
	type SoReasonAction,
	soErrorMessage,
	useConfirmSaleOrderMutation,
	useResumeSaleOrderMutation,
	useRunSoExplosionMutation,
	useSaleOrderQuery,
} from "@/lib/api/sale-order/queries";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { DnListRow } from "@/types/delivery-note";
import type { SoDetail } from "@/types/sale-order";

const DOC_LABEL = {
	pr: "Purchase requisition",
	sco: "Subcontract order",
} as const;

function flowSteps(so: SoDetail, notes: DnListRow[]): DocumentFlowStep[] {
	const steps: DocumentFlowStep[] = [
		{
			label: "Sale order",
			docNo: so.soNumber,
			status: <StatusBadge doc="so" status={so.status} />,
			state: so.status === "draft" ? "current" : "done",
		},
	];
	if (so.status === "draft" || so.status === "cancelled") return steps;

	const snapshot = so.currentSnapshot;
	steps.push({
		label: "Explosion",
		docNo: snapshot?.number,
		href: snapshot ? `/sale-orders/${so.id}/explosion` : undefined,
		status: snapshot ? (
			<StatusBadge
				doc="soSnapshot"
				status={snapshot.outOfDate ? "out_of_date" : "current"}
			/>
		) : undefined,
		state: snapshot && !snapshot.outOfDate ? "done" : "current",
	});
	const seen = new Map<string, number>();
	for (const doc of so.raisedDocuments) {
		const base = DOC_LABEL[doc.type];
		const count = (seen.get(base) ?? 0) + 1;
		seen.set(base, count);
		steps.push({
			label: count === 1 ? base : `${base} (${count})`,
			docNo: doc.number,
			href: raisedDocHref(doc),
			status: <StatusBadge doc={doc.type} status={doc.status} />,
			state: "done",
		});
	}
	// One step per note that has not been cancelled (BR-DSP-38); none yet = a plain "not yet" step.
	const live = notes.filter((note) => note.status !== "cancelled");
	if (live.length === 0) {
		steps.push({ label: "Delivery note", state: "todo" });
		return steps;
	}
	for (const note of live) {
		steps.push({
			label: "Delivery note",
			docNo: note.dnNumber ?? "Draft",
			href: `/delivery-notes/${note.id}`,
			status: <StatusBadge doc="dn" status={note.status} />,
			state: note.status === "posted" ? "done" : "todo",
		});
	}
	return steps;
}

export function SaleOrderDetailView({ soId }: { soId: number }) {
	const router = useRouter();
	const canManage = useCan("so.manage");
	const canExplode = useCan("so.explode");
	const canDispatchView = useCan("dispatch.view");
	const canDispatch = useCan("dispatch.manage");
	const query = useSaleOrderQuery(soId);
	const notesQuery = useDeliveryNotesQuery(
		{ soId, page: 1, pageSize: 100 },
		canDispatchView,
	);
	const so = query.data?.data;
	useBreadcrumbLast(so?.soNumber);

	const confirm = useConfirmSaleOrderMutation(soId);
	const resume = useResumeSaleOrderMutation(soId);
	const explode = useRunSoExplosionMutation(soId);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [reasonAction, setReasonAction] = useState<SoReasonAction | null>(null);
	const [lastAction, setLastAction] = useState<SoReasonAction>("hold");

	const back = { backHref: "/sale-orders", backLabel: "sale orders" };

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (query.isError || !so) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<ErrorState
					message={soErrorMessage(query.error, "Sale order not found")}
					onRetry={() => {
						void query.refetch();
					}}
					retrying={query.isRefetching}
				/>
			</div>
		);
	}

	function onExplode() {
		explode.mutate(undefined, {
			onSuccess: () => router.push(`/sale-orders/${soId}/explosion`),
		});
	}

	function nextStep(order: SoDetail) {
		const waiting = (text: string) => (
			<span className="text-sm text-muted-foreground">{text}</span>
		);
		switch (order.status) {
			case "draft":
				return canManage ? (
					<Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
						Confirm
					</Button>
				) : (
					waiting("Waiting for confirmation")
				);
			case "on_hold":
				return canManage ? (
					<Button
						type="button"
						size="sm"
						disabled={resume.isPending}
						onClick={() => resume.mutate({ editVersion: order.editVersion })}
					>
						{resume.isPending ? "Resuming…" : "Resume"}
					</Button>
				) : null;
			case "confirmed": {
				const snapshot = order.currentSnapshot;
				if (snapshot && !snapshot.outOfDate) {
					return canExplode ? (
						<Button type="button" size="sm" asChild>
							<Link href={`/sale-orders/${order.id}/explosion`}>
								Create draft PRs / SCOs
							</Link>
						</Button>
					) : null;
				}
				return canExplode ? (
					<Button
						type="button"
						size="sm"
						disabled={explode.isPending}
						onClick={onExplode}
					>
						{explode.isPending ? "Exploding…" : "Explode BOM"}
					</Button>
				) : (
					waiting("Waiting for explosion")
				);
			}
			default:
				return null;
		}
	}

	// BR-DSP-37: a second action beside the SO's own next step, never inside "More". It is the
	// primary only when this user has no other next step (no "Explode BOM" / "Create drafts").
	const showDispatch =
		canDispatch &&
		so.status === "confirmed" &&
		so.lines.some((line) => line.openQty > 0);
	const hasOtherNextStep = so.status === "confirmed" && canExplode;

	const editable = so.status === "draft" || so.status === "confirmed";
	const canHold = so.status === "confirmed";
	const canClose = so.status === "confirmed" || so.status === "on_hold";
	const canCancel = so.status !== "closed" && so.status !== "cancelled";
	const hasMore = canManage && (editable || canHold || canClose || canCancel);

	function openReason(action: SoReasonAction) {
		setLastAction(action);
		setReasonAction(action);
	}

	let banner: string | null = null;
	if (so.status === "closed") {
		banner =
			so.closeKind === "fully_delivered"
				? "Closed — fully delivered"
				: `Closed by hand: ${so.closeReason ?? "–"} (${formatDateTime(so.lastUpdatedAt)})`;
	} else if (so.status === "cancelled") {
		banner = `Cancelled: ${so.cancelReason ?? "–"} (${formatDateTime(so.lastUpdatedAt)})`;
	} else if (so.status === "on_hold") {
		banner = `On hold: ${so.holdReason ?? "–"} (${formatDateTime(so.lastUpdatedAt)})`;
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={so.soNumber}
				status={<StatusBadge doc="so" status={so.status} />}
				meta={[
					{ label: "Customer", value: so.customerName },
					{ label: "Customer PO", value: so.customerPoNumber ?? "–" },
					{ label: "Ordered", value: formatDate(so.orderDate) },
					{ label: "Value", value: formatMoney(so.totalAmountPaise) },
				]}
				actions={
					<>
						{nextStep(so)}
						{showDispatch ? (
							<Button
								type="button"
								size="sm"
								variant={hasOtherNextStep ? "outline" : "default"}
								asChild
							>
								<Link href={`/delivery-notes/new?so=${so.id}`}>Dispatch</Link>
							</Button>
						) : null}
						{hasMore ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button type="button" size="sm" variant="outline">
										<IconDots />
										More
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{editable ? (
										<DropdownMenuItem asChild>
											<Link href={`/sale-orders/${so.id}/edit`}>Edit</Link>
										</DropdownMenuItem>
									) : null}
									{canHold ? (
										<DropdownMenuItem onSelect={() => openReason("hold")}>
											Hold
										</DropdownMenuItem>
									) : null}
									{canClose ? (
										<DropdownMenuItem onSelect={() => openReason("close")}>
											Close
										</DropdownMenuItem>
									) : null}
									{canCancel ? (
										<DropdownMenuItem onSelect={() => openReason("cancel")}>
											Cancel
										</DropdownMenuItem>
									) : null}
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
					</>
				}
				{...back}
			/>

			<DocumentFlow steps={flowSteps(so, notesQuery.data?.data ?? [])} />

			{banner ? (
				<output className="block rounded-md bg-neutral-subtle px-3 py-2 text-sm text-neutral">
					{banner}
				</output>
			) : null}

			<div className="grid gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
				<div className="flex min-w-0 flex-col gap-4">
					<SoLinesCard so={so} />
					<SoNotesCard so={so} />
					<SoCustomerCard so={so} />
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<SoExplosionPanel so={so} />
					{canDispatchView ? (
						<SoDeliveryNotesPanel
							notes={notesQuery.data?.data}
							loading={notesQuery.isLoading}
							failed={notesQuery.isError}
						/>
					) : null}
					<SoRaisedPanel so={so} />
					<SoActivityPanel soId={so.id} />
				</div>
			</div>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirm {so.soNumber}?</AlertDialogTitle>
						<AlertDialogDescription>
							A confirmed order can be exploded into purchase and job-work
							needs. Customer and items can no longer be changed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={confirm.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={confirm.isPending}
							onClick={(event) => {
								event.preventDefault();
								confirm.mutate(
									{ editVersion: so.editVersion },
									{ onSuccess: () => setConfirmOpen(false) },
								);
							}}
						>
							{confirm.isPending ? "Confirming…" : "Confirm"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<SoReasonDialog
				key={lastAction}
				open={reasonAction !== null}
				onOpenChange={(open) => {
					if (!open) setReasonAction(null);
				}}
				action={lastAction}
				soId={so.id}
				soNumber={so.soNumber}
				editVersion={so.editVersion}
			/>
		</div>
	);
}
