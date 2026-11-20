"use client";

import {
	IconArrowBackUp,
	IconCheck,
	IconInbox,
	IconX,
} from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDocNo, formatMoney } from "@/lib/format";
import type {
	ApprovalRequestAction,
	ApprovalRequestSummary,
} from "@/types/approval";

export type PendingApprovalAction = Extract<
	ApprovalRequestAction,
	"approve" | "reject" | "sent_back" | "withdraw"
>;

const ACTION_CONFIG: Record<
	PendingApprovalAction,
	{
		label: string;
		icon: typeof IconCheck;
		variant: "default" | "destructive" | "outline";
	}
> = {
	approve: { label: "Approve", icon: IconCheck, variant: "outline" },
	reject: { label: "Reject", icon: IconX, variant: "destructive" },
	sent_back: { label: "Send back", icon: IconArrowBackUp, variant: "outline" },
	withdraw: { label: "Withdraw", icon: IconArrowBackUp, variant: "outline" },
};

type ApprovalInboxTableProps = {
	approvals: ApprovalRequestSummary[];
	isLoading: boolean;
	actingRequest: { id: number; action: PendingApprovalAction } | null;
	isActing: boolean;
	currentUserId: number;
	onAction: (
		request: ApprovalRequestSummary,
		action: PendingApprovalAction,
	) => void;
	errorState?: ReactNode;
};

export function ApprovalInboxTable({
	approvals,
	isLoading,
	actingRequest,
	isActing,
	currentUserId,
	onAction,
	errorState,
}: ApprovalInboxTableProps) {
	const columns = useMemo<DataTableColumnDef<ApprovalRequestSummary>[]>(
		() => [
			{
				id: "docNumber",
				header: "Document",
				cell: ({ row }) => (
					<span className="font-mono text-brand-accent">
						{formatDocNo(row.original.docSummary.docNumber)}
					</span>
				),
			},
			{
				id: "docType",
				header: "Type",
				cell: ({ row }) => row.original.docType.toUpperCase(),
			},
			{
				id: "policy",
				header: "Policy",
				cell: ({ row }) =>
					row.original.policyName || `Policy #${row.original.policyId}`,
			},
			{
				id: "supplier",
				header: "Supplier",
				cell: ({ row }) => row.original.docSummary.supplierName || "–",
			},
			{
				id: "amount",
				header: "Amount",
				meta: { numeric: true },
				cell: ({ row }) => formatMoney(row.original.docSummary.amountPaise),
			},
			{
				id: "level",
				header: "Level",
				cell: ({ row }) =>
					`${row.original.currentLevel} of ${row.original.totalLevels}`,
			},
			{
				id: "requestedAt",
				header: "Requested",
				cell: ({ row }) => formatDateTime(row.original.requestedAt),
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => {
					const approval = row.original;
					return (
						<div className="flex flex-wrap gap-2">
							{(Object.keys(ACTION_CONFIG) as PendingApprovalAction[])
								// Withdraw is for the requester only (BR-APR-39).
								.filter(
									(action) =>
										action !== "withdraw" ||
										approval.requestedBy === currentUserId,
								)
								.map((action) => {
									const config = ACTION_CONFIG[action];
									const Icon = config.icon;
									const isThisAction =
										actingRequest?.id === approval.id &&
										actingRequest.action === action;
									return (
										<Button
											key={action}
											type="button"
											size="sm"
											variant={config.variant}
											disabled={isActing}
											onClick={() => onAction(approval, action)}
										>
											<Icon className="size-3.5" />
											{isThisAction ? `${config.label}…` : config.label}
										</Button>
									);
								})}
						</div>
					);
				},
			},
		],
		[actingRequest, isActing, currentUserId, onAction],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: approvals,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	return (
		<DataTable
			table={table}
			isLoading={isLoading}
			hidePagination
			errorState={errorState}
			emptyState={
				<EmptyState
					icon={IconInbox}
					title="Nothing waiting for your approval"
					description="Requests assigned to you show up here."
				/>
			}
		/>
	);
}
