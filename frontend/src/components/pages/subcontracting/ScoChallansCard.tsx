"use client";

import Link from "next/link";
import { ChallanDueBadge } from "@/components/pages/subcontracting/ChallanDueBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useScoChallansQuery } from "@/lib/api/subcontracting/queries";
import { formatDate, formatMoney } from "@/lib/format";

export function ScoChallansCard({ scoId }: { scoId: number }) {
	const query = useScoChallansQuery(scoId);
	const challans = query.data?.success ? query.data.data : [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Challans</CardTitle>
			</CardHeader>
			<CardContent>
				{query.isLoading ? (
					<Skeleton className="h-16" />
				) : challans.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No material issued yet.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Challan</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>E-way bill</TableHead>
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
									<TableCell>{formatDate(challan.challanDate)}</TableCell>
									<TableCell>{challan.ewayBillNo ?? "-"}</TableCell>
									<TableCell className="text-right">
										{formatMoney(challan.valuePaise)}
									</TableCell>
									<TableCell>
										<span className="mr-2">
											{formatDate(challan.returnDueDate)}
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
	);
}
