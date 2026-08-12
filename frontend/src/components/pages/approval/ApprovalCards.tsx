"use client";

import {
	IconArrowBackUp,
	IconCheck,
	IconRefresh,
	IconX,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	ApprovalRequestAction,
	ApprovalRequestSummary,
} from "@/types/approval";

export type PendingApprovalAction = Extract<
	ApprovalRequestAction,
	"approve" | "reject" | "sent_back"
>;

const ACTION_CONFIG: Record<
	PendingApprovalAction,
	{
		label: string;
		icon: typeof IconCheck;
		variant: "default" | "destructive" | "outline";
	}
> = {
	approve: {
		label: "Approve",
		icon: IconCheck,
		variant: "default",
	},
	reject: {
		label: "Reject",
		icon: IconX,
		variant: "destructive",
	},
	sent_back: {
		label: "Send back",
		icon: IconArrowBackUp,
		variant: "outline",
	},
};

const SKELETON_CARDS = 6;

type ApprovalCardsProps = {
	approvals: ApprovalRequestSummary[];
	isLoading: boolean;
	actingRequest: { id: number; action: PendingApprovalAction } | null;
	isActing: boolean;
	onAction: (
		request: ApprovalRequestSummary,
		action: PendingApprovalAction,
	) => void;
};

function formatDocType(docType: string) {
	return docType.toUpperCase();
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function formatMoney(paise: number) {
	return `₹${(paise / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 0,
	})}`;
}

export function ApprovalCardsSkeleton() {
	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{Array.from({ length: SKELETON_CARDS }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
				<Card key={`approval-skeleton-${index}`}>
					<CardHeader className="space-y-2">
						<Skeleton className="h-5 w-2/3" />
						<Skeleton className="h-4 w-1/2" />
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
						<Skeleton className="h-4 w-3/4" />
					</CardContent>
					<CardFooter className="gap-2">
						<Skeleton className="h-7 flex-1" />
						<Skeleton className="h-7 flex-1" />
						<Skeleton className="h-7 flex-1" />
					</CardFooter>
				</Card>
			))}
		</div>
	);
}

export function ApprovalCards({
	approvals,
	isLoading,
	actingRequest,
	isActing,
	onAction,
}: ApprovalCardsProps) {
	if (isLoading) return <ApprovalCardsSkeleton />;

	if (approvals.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No pending approvals found.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{approvals.map((approval) => (
				<Card key={approval.id}>
					<CardHeader className="space-y-2">
						<div className="flex items-start justify-between gap-2">
							<CardTitle className="text-base">
								{approval.docSummary.docNumber}
							</CardTitle>
							<Badge variant="secondary">
								{formatDocType(approval.docType)}
							</Badge>
						</div>
						<p className="text-xs text-muted-foreground">
							{approval.policyName || `Policy #${approval.policyId}`} ·
							Requested {formatDate(approval.requestedAt)}
						</p>
					</CardHeader>

					<CardContent>
						<div className="grid grid-cols-2 gap-3 text-xs">
							<div>
								<p className="text-muted-foreground">Amount</p>
								<p>{formatMoney(approval.docSummary.amountPaise)}</p>
							</div>
							<div>
								<p className="text-muted-foreground">Current level</p>
								<p>
									{approval.currentLevel} of {approval.totalLevels}
								</p>
							</div>
							{approval.docSummary.supplierName ? (
								<div className="col-span-2">
									<p className="text-muted-foreground">Supplier</p>
									<p>{approval.docSummary.supplierName}</p>
								</div>
							) : null}
						</div>
					</CardContent>

					<CardFooter className="grid grid-cols-1 gap-2 sm:grid-cols-3">
						{Object.entries(ACTION_CONFIG).map(([action, config]) => {
							const Icon = config.icon;
							const isThisAction =
								actingRequest?.id === approval.id &&
								actingRequest.action === action;

							return (
								<Button
									key={action}
									type="button"
									variant={config.variant}
									disabled={isActing}
									onClick={() =>
										onAction(approval, action as PendingApprovalAction)
									}
								>
									{isThisAction ? (
										<IconRefresh className="size-3.5 animate-spin" />
									) : (
										<Icon className="size-3.5" />
									)}
									{config.label}
								</Button>
							);
						})}
					</CardFooter>
				</Card>
			))}
		</div>
	);
}
