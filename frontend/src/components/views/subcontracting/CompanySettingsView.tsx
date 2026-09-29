"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

import { CompanySettingsForm } from "@/components/pages/subcontracting/CompanySettingsForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useCompanySettingsQuery } from "@/lib/api/subcontracting/queries";

export function CompanySettingsView() {
	// Owner-only (contract: `company.manage`).
	const canEdit = useCan("company.manage");
	const query = useCompanySettingsQuery(canEdit);

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<Button type="button" variant="ghost" size="sm" className="w-fit" asChild>
				<Link href="/subcontracting">
					<IconArrowLeft className="size-3.5" />
					Back to orders
				</Link>
			</Button>
			<div>
				<h1 className="font-heading text-lg font-medium">Company details</h1>
				<p className="text-xs text-muted-foreground">
					Printed on the job-work challan. Only the owner can change these.
				</p>
			</div>
			{!canEdit ? (
				<p className="text-sm text-muted-foreground">
					You do not have permission to edit company details.
				</p>
			) : query.isLoading ? (
				<Skeleton className="h-48 max-w-xl" />
			) : (
				<CompanySettingsForm
					key={query.data?.data?.updatedAt ?? "new"}
					settings={query.data?.data ?? null}
				/>
			)}
		</div>
	);
}
