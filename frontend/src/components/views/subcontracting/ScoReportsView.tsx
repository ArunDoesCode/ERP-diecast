"use client";

import Link from "next/link";

import { LossLogReport } from "@/components/pages/subcontracting/LossLogReport";
import { ScoRegisterReport } from "@/components/pages/subcontracting/ScoRegisterReport";
import { VendorStockReport } from "@/components/pages/subcontracting/VendorStockReport";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/hooks/use-can";

export function ScoReportsView() {
	const canView = useCan("sco.view");

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Subcontracting reports"
				description="Stock at vendors, the order register and the loss log."
				actions={
					<Button type="button" size="sm" variant="outline" asChild>
						<Link href="/subcontracting/challans">Open challans</Link>
					</Button>
				}
			/>

			{canView ? (
				<Tabs defaultValue="vendor-stock">
					<TabsList>
						<TabsTrigger value="vendor-stock">Stock at vendors</TabsTrigger>
						<TabsTrigger value="register">SCO register</TabsTrigger>
						<TabsTrigger value="loss-log">Loss log</TabsTrigger>
					</TabsList>
					<TabsContent value="vendor-stock">
						<VendorStockReport />
					</TabsContent>
					<TabsContent value="register">
						<ScoRegisterReport />
					</TabsContent>
					<TabsContent value="loss-log">
						<LossLogReport />
					</TabsContent>
				</Tabs>
			) : (
				<p className="text-sm text-muted-foreground">
					You do not have access to these reports.
				</p>
			)}
		</div>
	);
}
