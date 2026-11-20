"use client";

import { IconInbox } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import {
	DOC_TYPE_LABEL,
	roleLabel,
} from "@/components/pages/approval/approval-labels";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ApprovalInboxRow } from "@/lib/api/approval/document-view-types";
import { formatDateTime, formatDocNo, formatMoney } from "@/lib/format";

export function inboxRowNumber(row: ApprovalInboxRow) {
	return row.docNumber ?? row.docSummary?.docNumber ?? "";
}

export function inboxRowAmount(row: ApprovalInboxRow) {
	return row.amountPaise ?? row.docSummary?.amountPaise ?? null;
}

type ApprovalInboxTableProps = {
	approvals: ApprovalInboxRow[];
	isLoading: boolean;
	selectedId: number | null;
	/** Wide screens: select the row. Narrow screens: link to the preview page. */
	splitView: boolean;
	onSelect: (row: ApprovalInboxRow) => void;
	errorState?: ReactNode;
};

export function ApprovalInboxTable({
	approvals,
	isLoading,
	selectedId,
	splitView,
	onSelect,
	errorState,
}: ApprovalInboxTableProps) {
	// Amount column only when the API sends it (BR-FF-77).
	const showAmount = approvals.some((row) => inboxRowAmount(row) !== null);

	const columns = useMemo<DataTableColumnDef<ApprovalInboxRow>[]>(() => {
		const cols: DataTableColumnDef<ApprovalInboxRow>[] = [
			{
				id: "docNumber",
				header: "Document",
				cell: ({ row }) => {
					const r = row.original;
					const label = formatDocNo(inboxRowNumber(r));
					const className = "font-mono text-brand-accent hover:underline";
					return splitView ? (
						<button
							type="button"
							className={className}
							aria-current={r.id === selectedId ? "true" : undefined}
							onClick={() => onSelect(r)}
						>
							{label}
						</button>
					) : (
						<Link
							href={`/approvals/${r.docType}/${r.docId}`}
							className={className}
						>
							{label}
						</Link>
					);
				},
			},
			{
				id: "docType",
				header: "Type",
				cell: ({ row }) => DOC_TYPE_LABEL[row.original.docType],
			},
			{
				id: "requester",
				header: "Requester",
				cell: ({ row }) => row.original.requesterName || "–",
			},
		];
		if (showAmount) {
			cols.push({
				id: "amount",
				header: "Amount",
				meta: { numeric: true },
				cell: ({ row }) => formatMoney(inboxRowAmount(row.original)),
			});
		}
		cols.push(
			{
				id: "level",
				header: "Level",
				cell: ({ row }) => {
					const r = row.original;
					const role = roleLabel(r.currentApproverRole);
					return `${r.currentLevel} of ${r.totalLevels}${role ? ` · ${role}` : ""}`;
				},
			},
			{
				id: "requestedAt",
				header: "Waiting since",
				cell: ({ row }) => formatDateTime(row.original.requestedAt),
			},
		);
		return cols;
	}, [showAmount, splitView, selectedId, onSelect]);

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
			rowClassName={(row) => (row.id === selectedId ? "bg-muted" : undefined)}
			emptyState={
				<EmptyState
					icon={IconInbox}
					title="Nothing is waiting for your approval"
					description="Requests assigned to you show up here."
				/>
			}
		/>
	);
}
