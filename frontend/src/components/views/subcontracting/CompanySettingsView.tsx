"use client";

import { CompanySettingsForm } from "@/components/pages/subcontracting/CompanySettingsForm";
import { CompanySettingsHistory } from "@/components/pages/subcontracting/CompanySettingsHistory";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useCompanySettingsQuery } from "@/lib/api/subcontracting/queries";

export function CompanySettingsView() {
	// Owner-only (contract: `company.manage`); history is readable with `sco.view` (BR-SCO-29).
	const canEdit = useCan("company.manage");
	const canView = useCan("sco.view");
	const query = useCompanySettingsQuery(canEdit);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title="Company details"
				description="Printed on the job-work challan. Only the owner can change these."
			/>
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
			{canView || canEdit ? <CompanySettingsHistory /> : null}
		</div>
	);
}
