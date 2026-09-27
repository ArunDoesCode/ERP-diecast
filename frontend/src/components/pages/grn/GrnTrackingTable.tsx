"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getGrnStatusBadgeStyle } from "@/lib/grn-status-badge";
import { humanizeStatusLabel } from "@/lib/pr-status-badge";
import type { Grn } from "@/types/grn";

type GrnTrackingTableProps = {
	grns: Grn[];
	isLoading: boolean;
};

const SKELETON_ROWS = 6;

function formatDate(value?: string | null) {
	if (!value) return "-";
	return new Date(value).toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function GrnTrackingTable({ grns, isLoading }: GrnTrackingTableProps) {
	return (
		<Card>
			<CardContent className="p-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>GRN #</TableHead>
							<TableHead>PO</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Received date</TableHead>
							<TableHead className="w-20" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: SKELETON_ROWS }, (_, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
								<TableRow key={`grn-tracking-skeleton-${index}`}>
									<TableCell>
										<Skeleton className="h-4 w-20" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-24" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-20" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-12" />
									</TableCell>
								</TableRow>
							))
						) : grns.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="py-8 text-center text-muted-foreground"
								>
									No GRNs match this filter.
								</TableCell>
							</TableRow>
						) : (
							grns.map((grn) => {
								const badgeStyle = getGrnStatusBadgeStyle(grn.status);
								return (
									<TableRow key={grn.id}>
										<TableCell className="font-medium">
											{grn.grnNumber}
										</TableCell>
										<TableCell>
											{grn.poId != null ? `PO #${grn.poId}` : "-"}
										</TableCell>
										<TableCell>
											<Badge
												variant={badgeStyle.variant}
												className={badgeStyle.className}
											>
												{humanizeStatusLabel(grn.status)}
											</Badge>
										</TableCell>
										<TableCell>{formatDate(grn.receivedDate)}</TableCell>
										<TableCell>
											<Button type="button" size="sm" variant="outline" asChild>
												<Link href={`/grn/${grn.id}`}>View</Link>
											</Button>
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
