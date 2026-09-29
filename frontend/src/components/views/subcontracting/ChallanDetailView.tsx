"use client";

import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import Link from "next/link";

import { formatPaise } from "@/components/pages/inventory/inventory-format";
import { ChallanDueBadge } from "@/components/pages/subcontracting/ChallanDueBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useChallanDetailQuery } from "@/lib/api/subcontracting/queries";
import { formatScoDate } from "@/lib/sco-format";

export function ChallanDetailView({ challanId }: { challanId: number }) {
	const query = useChallanDetailQuery(challanId);

	const back = (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="w-fit print:hidden"
			asChild
		>
			<Link href="/subcontracting/challans">
				<IconArrowLeft className="size-3.5" />
				Back to open challans
			</Link>
		</Button>
	);

	if (query.isLoading) {
		return (
			<div className="flex flex-col gap-4 p-6">
				{back}
				<Skeleton className="h-64" />
			</div>
		);
	}

	const result = query.data;
	if (!result?.success) {
		return (
			<div className="flex flex-col gap-4 p-6">
				{back}
				<p className="text-sm text-muted-foreground">
					{result?.message ?? "Challan not found."}
				</p>
			</div>
		);
	}

	const { challan, lines, company, vendor, declaration } = result.data;
	const placeOfSupply = vendor.stateCode ?? "-";
	const total = lines.reduce((sum, line) => sum + line.lineValuePaise, 0);

	return (
		<div className="flex w-full flex-col gap-4 p-6">
			<div className="flex items-center justify-between print:hidden">
				{back}
				<Button type="button" size="sm" onClick={() => window.print()}>
					<IconPrinter className="size-3.5" />
					Print challan
				</Button>
			</div>

			<div className="mx-auto w-full max-w-3xl space-y-5 rounded-md border bg-background p-6 text-xs print:max-w-none print:border-0 print:p-0">
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-1">
						<h1 className="font-heading text-base font-medium">
							Delivery challan - job work
						</h1>
						<p className="text-sm font-semibold">{challan.challanNumber}</p>
						<p>Date: {formatScoDate(challan.challanDate)}</p>
						<p>SCO: {challan.scoNumber}</p>
						<p>E-way bill: {challan.ewayBillNo ?? "-"}</p>
					</div>
					<div className="space-y-1 text-right print:hidden">
						<p className="text-muted-foreground">Return due</p>
						<p className="font-medium">
							{formatScoDate(challan.returnDueDate)}
						</p>
						<ChallanDueBadge challan={challan} />
					</div>
					<div className="hidden text-right print:block">
						<p>Return due: {formatScoDate(challan.returnDueDate)}</p>
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-0.5">
						<p className="font-medium text-muted-foreground">
							Consignor (principal)
						</p>
						<p className="font-medium">{company?.name ?? "-"}</p>
						<p>{company?.address ?? "-"}</p>
						<p>GSTIN: {company?.gstin ?? "-"}</p>
						<p>State code: {company?.stateCode ?? "-"}</p>
					</div>
					<div className="space-y-0.5">
						<p className="font-medium text-muted-foreground">
							Consignee (job worker)
						</p>
						<p className="font-medium">{vendor.name}</p>
						<p>{vendor.address ?? "-"}</p>
						<p>GSTIN: {vendor.gstin ?? "unregistered"}</p>
						<p>Place of supply (state code): {placeOfSupply}</p>
					</div>
				</div>

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>#</TableHead>
							<TableHead>Item</TableHead>
							<TableHead>HSN</TableHead>
							<TableHead>Heat no.</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Rate</TableHead>
							<TableHead className="text-right">Taxable value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{lines.map((line, index) => (
							<TableRow key={line.id}>
								<TableCell>{index + 1}</TableCell>
								<TableCell>
									{line.itemSku} · {line.itemName}
								</TableCell>
								<TableCell>{line.hsnCode}</TableCell>
								<TableCell>{line.heatNumber ?? "-"}</TableCell>
								<TableCell className="text-right">{line.qty}</TableCell>
								<TableCell className="text-right">
									{formatPaise(line.unitIssueCostPaise)}
								</TableCell>
								<TableCell className="text-right">
									{formatPaise(line.lineValuePaise)}
								</TableCell>
							</TableRow>
						))}
						<TableRow>
							<TableCell colSpan={6} className="text-right font-medium">
								Total
							</TableCell>
							<TableCell className="text-right font-medium">
								{formatPaise(total)}
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>

				<p className="font-medium">{declaration}</p>
			</div>
		</div>
	);
}
