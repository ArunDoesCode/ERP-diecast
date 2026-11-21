"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ApprovalCardsSkeleton } from "@/components/pages/approval/ApprovalCards";
import {
	ApprovalInboxTable,
	inboxRowNumber,
} from "@/components/pages/approval/ApprovalInboxTable";
import { ApprovalPreviewPane } from "@/components/pages/approval/ApprovalPreviewPane";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { usePageSize } from "@/hooks/use-page-size";
import type { ApprovalInboxRow } from "@/lib/api/approval/document-view-types";
import {
	approvalKeys,
	useMyPendingApprovalsQuery,
} from "@/lib/api/approval/queries";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type { ApprovalDocType } from "@/types/approval";

type TypeFilter = "all" | ApprovalDocType;

const SPLIT_QUERY = "(min-width: 1100px)";

function subscribeSplit(callback: () => void) {
	const mql = window.matchMedia(SPLIT_QUERY);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

/** True at 1100 px and wider: list + preview side by side (screens.md screen 2). */
function useSplitView() {
	return useSyncExternalStore(
		subscribeSplit,
		() => window.matchMedia(SPLIT_QUERY).matches,
		() => true,
	);
}

type ApprovalListProps = {
	employeeId: number;
};

function ApprovalList({ employeeId }: ApprovalListProps) {
	const queryClient = useQueryClient();
	const splitView = useSplitView();
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = usePageSize("approvals");
	const [docType, setDocType] = useState<TypeFilter>("all");
	const [selectedId, setSelectedId] = useState<number | null>(null);

	const approvalsQuery = useMyPendingApprovalsQuery({
		page,
		pageSize,
		employeeId,
		docType: docType === "all" ? undefined : docType,
		sortBy: "requestedAt",
		sortDir: "asc",
	});

	const approvals = approvalsQuery.data?.data ?? [];
	const meta = approvalsQuery.data?.meta;
	const counts = meta?.typeCounts;

	// The open row; falls back to the first row (BR-FF-82: after acting the next row opens).
	const selected: ApprovalInboxRow | undefined = splitView
		? (approvals.find((row) => row.id === selectedId) ?? approvals[0])
		: undefined;

	const handleActed = useCallback(() => {
		// Open the neighbour of the row that is about to leave.
		const index = approvals.findIndex((row) => row.id === selected?.id);
		const next = approvals[index + 1] ?? approvals[index - 1];
		setSelectedId(next?.id ?? null);
		void queryClient.invalidateQueries({ queryKey: approvalKeys.myPending() });
	}, [approvals, selected?.id, queryClient]);

	const quick = [
		{
			key: "all",
			label: "All",
			count: counts ? counts.pr + counts.po + counts.sco : undefined,
		},
		{ key: "pr", label: "Requisition", count: counts?.pr },
		{ key: "po", label: "Order", count: counts?.po },
		{ key: "sco", label: "Job work", count: counts?.sco },
	];

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Approvals"
				description="Review requests waiting for your action."
			/>

			<FilterBar
				quick={quick}
				value={docType}
				onChange={(key) => {
					setDocType(key as TypeFilter);
					setSelectedId(null);
					setPage(1);
				}}
			/>

			<div className="grid grid-cols-1 gap-6 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				<div className="min-w-0 space-y-2">
					<ApprovalInboxTable
						approvals={approvals}
						isLoading={approvalsQuery.isLoading}
						selectedId={selected?.id ?? null}
						splitView={splitView}
						onSelect={(row) => setSelectedId(row.id)}
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
					<Pagination
						page={page}
						pageSize={pageSize}
						total={meta?.total ?? 0}
						onPageChange={setPage}
						onPageSizeChange={(next) => {
							setPageSize(next);
							setPage(1);
						}}
					/>
				</div>

				{splitView && selected ? (
					<aside
						aria-label={`Preview of ${inboxRowNumber(selected)}`}
						className="min-w-0 self-start rounded-lg border bg-card p-4"
					>
						<ApprovalPreviewPane
							key={`${selected.docType}-${selected.docId}`}
							docType={selected.docType}
							docId={selected.docId}
							onActed={handleActed}
						/>
					</aside>
				) : null}
			</div>
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
