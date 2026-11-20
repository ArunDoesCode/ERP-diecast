"use client";

import { useState } from "react";
import {
	ApprovalActionDialog,
	type InboxAction,
} from "@/components/pages/approval/ApprovalActionDialog";
import { ApprovalCardsSkeleton } from "@/components/pages/approval/ApprovalCards";
import {
	ApprovalInboxTable,
	type PendingApprovalAction,
} from "@/components/pages/approval/ApprovalInboxTable";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useActOnApprovalRequestMutation,
	useMyPendingApprovalsQuery,
} from "@/lib/api/approval/queries";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type {
	ApprovalDocType,
	ApprovalPendingSortField,
	ApprovalRequestSummary,
} from "@/types/approval";

const SORT_FIELDS: Array<{ label: string; value: ApprovalPendingSortField }> = [
	{ label: "Requested", value: "requestedAt" },
	{ label: "Document type", value: "docType" },
	{ label: "Status", value: "status" },
];

type ApprovalListProps = {
	employeeId: number;
};

function ApprovalList({ employeeId }: ApprovalListProps) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [docType, setDocType] = useState<"all" | ApprovalDocType>("all");
	const [sortBy, setSortBy] = useState<ApprovalPendingSortField>("requestedAt");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const [actingRequest, setActingRequest] = useState<{
		id: number;
		action: PendingApprovalAction;
	} | null>(null);
	// Request waiting for its comment dialog (BR-APR-37).
	const [dialogRequest, setDialogRequest] = useState<{
		approval: ApprovalRequestSummary;
		action: InboxAction;
	} | null>(null);

	const approvalsQuery = useMyPendingApprovalsQuery({
		page,
		pageSize,
		employeeId,
		docType: docType === "all" ? undefined : docType,
		sortBy,
		sortDir,
	});
	const actionMutation = useActOnApprovalRequestMutation();

	const approvals = approvalsQuery.data?.data ?? [];
	const meta = approvalsQuery.data?.meta;

	function actOnRequest(
		approval: ApprovalRequestSummary,
		action: PendingApprovalAction,
	) {
		setDialogRequest({ approval, action });
	}

	function confirmAction(notes: string) {
		if (!dialogRequest) return;
		const { approval, action } = dialogRequest;
		setActingRequest({ id: approval.id, action });
		actionMutation.mutate(
			{ id: approval.id, input: { action, notes: notes || undefined } },
			{
				onSuccess: () => setDialogRequest(null),
				onSettled: () => {
					setActingRequest(null);
				},
			},
		);
	}

	const filtersActive = docType !== "all";

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Approvals"
				description="Review requests waiting for your action."
			/>

			<FilterBar
				value="all"
				onChange={() => {}}
				onReset={() => {
					setDocType("all");
					setPage(1);
				}}
				filtersActive={filtersActive}
			>
				<Select
					value={docType}
					onValueChange={(value) => {
						setDocType(value as "all" | ApprovalDocType);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-44" aria-label="Document type">
						<SelectValue placeholder="Document type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All documents</SelectItem>
						<SelectItem value="pr">Purchase requisitions</SelectItem>
						<SelectItem value="po">Purchase orders</SelectItem>
						<SelectItem value="sco">Sale orders</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={sortBy}
					onValueChange={(value) => {
						setSortBy(value as ApprovalPendingSortField);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-44" aria-label="Sort by">
						<SelectValue placeholder="Sort by" />
					</SelectTrigger>
					<SelectContent>
						{SORT_FIELDS.map((field) => (
							<SelectItem key={field.value} value={field.value}>
								{field.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={sortDir}
					onValueChange={(value) => {
						setSortDir(value as "asc" | "desc");
						setPage(1);
					}}
				>
					<SelectTrigger className="w-32" aria-label="Order">
						<SelectValue placeholder="Order" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="desc">Desc</SelectItem>
						<SelectItem value="asc">Asc</SelectItem>
					</SelectContent>
				</Select>
			</FilterBar>

			<ApprovalInboxTable
				approvals={approvals}
				isLoading={approvalsQuery.isLoading}
				actingRequest={actingRequest}
				isActing={actionMutation.isPending}
				currentUserId={employeeId}
				onAction={actOnRequest}
				errorState={
					approvalsQuery.isError ? (
						<ErrorState
							message="Failed to load pending approvals."
							onRetry={() => {
								void approvalsQuery.refetch();
							}}
							retrying={approvalsQuery.isRefetching}
						/>
					) : undefined
				}
			/>

			<ApprovalActionDialog
				key={
					dialogRequest
						? `${dialogRequest.approval.id}-${dialogRequest.action}`
						: "closed"
				}
				action={dialogRequest?.action ?? null}
				docNumber={dialogRequest?.approval.docSummary.docNumber ?? ""}
				isPending={actionMutation.isPending}
				onConfirm={confirmAction}
				onClose={() => setDialogRequest(null)}
			/>

			<Pagination
				page={page}
				pageSize={pageSize}
				total={meta?.total ?? 0}
				onPageChange={setPage}
				onPageSizeChange={(nextPageSize) => {
					setPageSize(nextPageSize);
					setPage(1);
				}}
			/>
		</div>
	);
}

export function ApprovalView() {
	const userId = useAuthSessionStore((state) => state.userId);
	const hasHydrated = useAuthSessionStore((state) => state.hasHydrated);
	const employeeId = userId ? Number(userId) : Number.NaN;

	if (!hasHydrated) {
		return (
			<div className="flex w-full flex-col gap-4">
				<ApprovalCardsSkeleton />
			</div>
		);
	}

	if (!Number.isFinite(employeeId)) {
		return (
			<div className="flex w-full flex-col gap-4">
				<ErrorState message="Employee id is required to load pending approvals." />
			</div>
		);
	}

	return <ApprovalList employeeId={employeeId} />;
}
