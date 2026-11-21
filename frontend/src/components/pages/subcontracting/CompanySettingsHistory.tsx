"use client";

import { IconHistory } from "@tabler/icons-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useCompanySettingsHistoryQuery } from "@/lib/api/subcontracting/queries";
import { formatDateTime, formatMoney } from "@/lib/format";

const FIELD_LABEL: Record<string, string> = {
	name: "Name",
	address: "Address",
	gstin: "GSTIN",
	stateCode: "State",
	priceToleranceBp: "Price tolerance",
	weightToleranceBp: "Weight tolerance",
	ewayIntraLimitPaise: "E-way bill limit",
};

// Tolerances are stored as basis points text; show them as a percent.
function historyValue(field: string, value: string | null) {
	if (!value) return "–";
	if (field === "ewayIntraLimitPaise") {
		const paise = Number(value);
		return Number.isFinite(paise) ? formatMoney(paise) : value;
	}
	if (field !== "priceToleranceBp" && field !== "weightToleranceBp") {
		return value;
	}
	const bp = Number(value);
	return Number.isFinite(bp) ? `${bp / 100}%` : value;
}

// BR-SCO-29: change history, newest first, read-only.
export function CompanySettingsHistory() {
	const query = useCompanySettingsHistoryQuery();
	const rows = query.data?.data ?? [];

	return (
		<section className="flex max-w-3xl flex-col gap-2">
			<h2 className="font-heading text-sm font-medium">Change history</h2>
			{query.isLoading ? (
				<Skeleton className="h-24 w-full" />
			) : query.isError ? (
				<ErrorState
					message={
						query.error instanceof Error
							? query.error.message
							: "The change history could not be loaded."
					}
					onRetry={() => {
						void query.refetch();
					}}
					retrying={query.isRefetching}
				/>
			) : rows.length === 0 ? (
				<EmptyState icon={IconHistory} title="No changes recorded yet" />
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>When</TableHead>
							<TableHead>Who</TableHead>
							<TableHead>Field</TableHead>
							<TableHead>Old value</TableHead>
							<TableHead>New value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell>{formatDateTime(row.changedAt)}</TableCell>
								<TableCell>{row.changedByName ?? "–"}</TableCell>
								<TableCell>{FIELD_LABEL[row.field] ?? row.field}</TableCell>
								<TableCell>{historyValue(row.field, row.oldValue)}</TableCell>
								<TableCell>{historyValue(row.field, row.newValue)}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
