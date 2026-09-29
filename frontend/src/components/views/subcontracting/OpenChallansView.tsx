"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { PurchaseRequisitionsPagination } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsPagination";
import { ChallanDueBadge } from "@/components/pages/subcontracting/ChallanDueBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useOpenChallansQuery } from "@/lib/api/subcontracting/queries";
import { formatScoDate } from "@/lib/sco-format";
import type { ChallanDueStatus } from "@/types/subcontracting";

const DUE_OPTIONS: Array<{ label: string; value: "all" | ChallanDueStatus }> = [
	{ label: "All open challans", value: "all" },
	{ label: "Due within 60 days", value: "warning" },
	{ label: "Overdue", value: "overdue" },
	{ label: "On track", value: "ok" },
];

export function OpenChallansView() {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [dueStatus, setDueStatus] = useState<"all" | ChallanDueStatus>("all");

	const query = useOpenChallansQuery({
		page,
		pageSize,
		sortBy: "returnDueDate",
		sortDir: "asc",
		dueStatus: dueStatus === "all" ? undefined : dueStatus,
	});
	const challans = query.data?.data ?? [];

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<Button type="button" variant="ghost" size="sm" className="w-fit" asChild>
				<Link href="/subcontracting">
					<IconArrowLeft className="size-3.5" />
					Back to orders
				</Link>
			</Button>

			<div>
				<h1 className="font-heading text-lg font-medium">Open challans</h1>
				<p className="text-xs text-muted-foreground">
					Material at vendors that has not come back. Return within 1 year of
					the challan date, otherwise it counts as a supply.
				</p>
			</div>

			<Select
				value={dueStatus}
				onValueChange={(value) => {
					setDueStatus(value as "all" | ChallanDueStatus);
					setPage(1);
				}}
			>
				<SelectTrigger className="w-full sm:w-64" aria-label="Due status">
					<SelectValue placeholder="Due status" />
				</SelectTrigger>
				<SelectContent>
					{DUE_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Card>
				<CardContent>
					{query.isLoading ? (
						<Skeleton className="h-32" />
					) : challans.length === 0 ? (
						<p className="py-6 text-center text-muted-foreground">
							No open challans.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Challan</TableHead>
									<TableHead>SCO</TableHead>
									<TableHead>Vendor</TableHead>
									<TableHead>Date</TableHead>
									<TableHead className="text-right">Value</TableHead>
									<TableHead>Return due</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{challans.map((challan) => (
									<TableRow key={challan.id}>
										<TableCell>
											<Link
												href={`/subcontracting/challans/${challan.id}`}
												className="font-medium underline-offset-2 hover:underline"
											>
												{challan.challanNumber}
											</Link>
										</TableCell>
										<TableCell>
											<Link
												href={`/subcontracting/${challan.scoId}`}
												className="underline-offset-2 hover:underline"
											>
												{challan.scoNumber}
											</Link>
										</TableCell>
										<TableCell>{challan.vendorName}</TableCell>
										<TableCell>{formatScoDate(challan.challanDate)}</TableCell>
										<TableCell className="text-right">
											{formatPaise(challan.valuePaise)}
										</TableCell>
										<TableCell>
											<span className="mr-2">
												{formatScoDate(challan.returnDueDate)}
											</span>
											<ChallanDueBadge challan={challan} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<PurchaseRequisitionsPagination
				page={page}
				pageSize={pageSize}
				meta={query.data?.meta}
				onPageChange={setPage}
				onPageSizeChange={(next) => {
					setPageSize(next);
					setPage(1);
				}}
			/>
		</div>
	);
}
