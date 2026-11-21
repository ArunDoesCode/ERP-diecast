"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { roleLabel } from "@/components/pages/approval/approval-labels";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/api/client";
import { useDocumentPanelQuery } from "@/lib/api/document/queries";
import type {
	DocumentPanelData,
	PanelDocType,
	PanelLinkedDoc,
} from "@/lib/api/document/types";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

const HREF: Record<PanelLinkedDoc["docType"], string> = {
	pr: "/purchase-requisitions",
	po: "/purchase-orders",
	grn: "/grn",
	sco: "/subcontracting",
};

export type DocumentSidePanelProps = {
	docType: PanelDocType;
	docId: number;
	/** Role label of who can act now (Approvals block). */
	waitingFor?: string;
	/** Pinned above the dated events, e.g. the PO's current delay (BR-FF-54). */
	pinnedHistory?: ReactNode;
};

function Block({ title, children }: { title: string; children: ReactNode }) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="text-sm">{title}</CardTitle>
			</CardHeader>
			<CardContent className="text-sm">{children}</CardContent>
		</Card>
	);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="tabular-nums">{value}</dd>
		</div>
	);
}

function Totals({
	docType,
	totals,
}: {
	docType: PanelDocType;
	totals: NonNullable<DocumentPanelData["totals"]>;
}) {
	return (
		<dl className="space-y-1">
			{docType === "pr" ? (
				<>
					{totals.lineCount !== undefined ? (
						<Row label="Lines" value={totals.lineCount} />
					) : null}
					{totals.estimatedAmountPaise !== undefined ? (
						<Row
							label="Estimate"
							value={formatMoney(totals.estimatedAmountPaise)}
						/>
					) : null}
				</>
			) : null}
			{docType === "po" ? (
				<>
					{totals.subtotalPaise !== undefined ? (
						<Row label="Subtotal" value={formatMoney(totals.subtotalPaise)} />
					) : null}
					{totals.taxAmountPaise !== undefined ? (
						<Row label="GST" value={formatMoney(totals.taxAmountPaise)} />
					) : null}
					{totals.totalAmountPaise !== undefined ? (
						<Row
							label="Total"
							value={<strong>{formatMoney(totals.totalAmountPaise)}</strong>}
						/>
					) : null}
					{totals.receivedPct !== undefined ? (
						<Row label="Received" value={`${totals.receivedPct}%`} />
					) : null}
				</>
			) : null}
			{docType === "grn" ? (
				<>
					<Row
						label="Arrived"
						value={formatQty(totals.arrivedQty, totals.uom, 3)}
					/>
					<Row
						label="Accepted"
						value={formatQty(totals.acceptedQty, totals.uom, 3)}
					/>
					<Row
						label="Rejected"
						value={formatQty(totals.rejectedQty, totals.uom, 3)}
					/>
				</>
			) : null}
		</dl>
	);
}

function eventLabel(event: string) {
	return event.includes("_") && !event.includes(" ") ? roleLabel(event) : event;
}

function PanelBody({
	docType,
	data,
	waitingFor,
	pinnedHistory,
}: {
	docType: PanelDocType;
	data: DocumentPanelData;
	waitingFor?: string;
	pinnedHistory?: ReactNode;
}) {
	const approvals = data.approvals;
	return (
		<>
			{data.totals ? (
				<Block title="Totals">
					<Totals docType={docType} totals={data.totals} />
				</Block>
			) : null}

			{approvals ? (
				<Block title="Approvals">
					{approvals.status === null && approvals.trail.length === 0 ? (
						<p className="text-muted-foreground">Not submitted yet.</p>
					) : (
						<div className="space-y-2">
							{approvals.currentLevel !== null && approvals.totalLevels ? (
								<p>
									Level {approvals.currentLevel} of {approvals.totalLevels}
									{waitingFor ? ` — ${waitingFor}` : ""}
								</p>
							) : null}
							{approvals.trail.length > 0 ? (
								<ol className="space-y-1 border-l pl-3">
									{approvals.trail.map((entry, index) => (
										<li key={entry.id ?? `${entry.actionAt}-${index}`}>
											<span className="font-medium">
												{roleLabel(
													entry.action === "require_more_info"
														? "sent back"
														: entry.action,
												)}
											</span>
											{entry.actorName ? ` by ${entry.actorName}` : ""} ·{" "}
											{formatDateTime(entry.actionAt)}
											{entry.notes ? (
												<p className="text-muted-foreground">“{entry.notes}”</p>
											) : null}
										</li>
									))}
								</ol>
							) : null}
						</div>
					)}
				</Block>
			) : null}

			<Block title="Linked documents">
				{data.linked.length === 0 ? (
					<p className="text-muted-foreground">Nothing linked yet.</p>
				) : (
					<ul className="space-y-1.5">
						{data.linked.map((doc) => (
							<li
								key={`${doc.docType}-${doc.id}`}
								className="flex flex-wrap items-center gap-2"
							>
								{doc.canOpen ? (
									<Link
										href={`${HREF[doc.docType]}/${doc.id}`}
										className="font-mono text-brand-accent hover:underline"
									>
										{doc.number}
									</Link>
								) : (
									<span className="font-mono">{doc.number}</span>
								)}
								{doc.docType === "grn" && doc.qaStatus ? (
									<StatusBadge doc="grnQa" status={doc.qaStatus} />
								) : (
									<StatusBadge doc={doc.docType} status={doc.status} />
								)}
							</li>
						))}
					</ul>
				)}
			</Block>

			<Block title="History">
				{pinnedHistory ? (
					<div className="mb-2 rounded-md bg-muted p-2">{pinnedHistory}</div>
				) : null}
				{data.history.length === 0 ? (
					<p className="text-muted-foreground">No events yet.</p>
				) : (
					<ol className="space-y-1.5 border-l pl-3">
						{data.history.map((entry, index) => (
							<li key={`${entry.at}-${index}`}>
								<span className="font-medium">{eventLabel(entry.event)}</span>
								{entry.byName ? ` by ${entry.byName}` : ""} ·{" "}
								{formatDateTime(entry.at)}
								{entry.note ? (
									<p className="text-muted-foreground">“{entry.note}”</p>
								) : null}
							</li>
						))}
					</ol>
				)}
				{data.historyTruncated ? (
					<p className="mt-2 text-muted-foreground">Older events hidden</p>
				) : null}
			</Block>
		</>
	);
}

/** Side panel of a PR / PO / GRN page: Totals, Approvals, Linked documents, History (BR-FF-50). */
export function DocumentSidePanel({
	docType,
	docId,
	waitingFor,
	pinnedHistory,
}: DocumentSidePanelProps) {
	const query = useDocumentPanelQuery(docType, docId);

	if (query.isLoading) {
		return (
			<div className="space-y-4" aria-busy="true">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-32 w-full" />
			</div>
		);
	}
	if (query.isError || !query.data?.success) {
		const status =
			query.error instanceof ApiClientError ? query.error.status : 0;
		return status === 403 ? (
			<p role="alert" className="text-sm text-muted-foreground">
				You do not have access to this document
			</p>
		) : (
			<ErrorState
				message={
					status === 501
						? "The side panel is not available yet."
						: "Could not load the side panel."
				}
				onRetry={() => {
					void query.refetch();
				}}
				retrying={query.isRefetching}
			/>
		);
	}
	return (
		<PanelBody
			docType={docType}
			data={query.data.data}
			waitingFor={waitingFor}
			pinnedHistory={pinnedHistory}
		/>
	);
}
