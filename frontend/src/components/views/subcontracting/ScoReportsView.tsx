"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

import { LossLogReport } from "@/components/pages/subcontracting/LossLogReport";
import { ScoRegisterReport } from "@/components/pages/subcontracting/ScoRegisterReport";
import { VendorStockReport } from "@/components/pages/subcontracting/VendorStockReport";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/hooks/use-can";

export function ScoReportsView() {
	const canView = useCan("sco.view");

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<Button type="button" variant="ghost" size="sm" className="w-fit" asChild>
				<Link href="/subcontracting">
					<IconArrowLeft className="size-3.5" />
					Back to orders
				</Link>
			</Button>

			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-heading text-lg font-medium">
						Subcontracting reports
					</h1>
					<p className="text-xs text-muted-foreground">
						Stock at vendors, the order register and the loss log.
					</p>
				</div>
				<Button type="button" size="sm" variant="outline" asChild>
					<Link href="/subcontracting/challans">Open challans</Link>
				</Button>
			</div>

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
